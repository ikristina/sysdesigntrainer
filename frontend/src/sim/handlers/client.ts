// Client: where traffic starts. Sends its share of the global rps, plus retries.
// With failure share f last tick and r retries, it wants to resend offered × (f + f² + … + f^r):
// that feedback is what turns an overload into a retry storm. Two client policies tame it:
// - retry_budget: retries never exceed a share of requests (10% / 20%). The rest fail at once.
// - backoff 'exponential': retry k waits a random 0 to 2^(k-1) s (full jitter), so retries
//   land spread over the next seconds instead of all in the next tick.
import type { Handler, NodeState } from '../types'
import { asFlow, num } from './common'

const BUDGET: Record<string, number> = { unlimited: Infinity, '20%': 0.2, '10%': 0.1 }
const RING = 200 // ticks of scheduled retries kept (20 s at dt 0.1; the longest wait is 2^4 = 16 s)

export const client: Handler = ({ node, offered, children, prevPathFail: f, readRatio, state, dt }) => {
  const retries = num(node.params.retries, 0)
  const budget = BUDGET[String(node.params.retry_budget ?? 'unlimited')] ?? Infinity
  const backoff = node.params.backoff === 'exponential'

  const want: number[] = [] // retry rate per attempt k = 1..retries
  for (let k = 1; k <= retries; k++) want.push(offered * f ** k)
  const wanted = want.reduce((a, b) => a + b, 0)
  const share = wanted > 0 ? Math.min(1, (budget * offered) / wanted) : 1 // share of wanted retries the budget allows

  const next: NodeState = { ...state }
  const tick = state.tick ?? 0
  let retrying = 0
  if (!backoff) retrying = wanted * share
  else {
    // Spread retry k evenly over the next 2^(k-1) s, then take what's due now.
    want.forEach((rate, i) => {
      const ticks = Math.max(1, Math.round(2 ** i / dt))
      for (let j = 1; j <= ticks; j++) { const at = (tick + j) % RING; next[`b${at}`] = (next[`b${at}`] ?? 0) + (rate * share) / ticks }
    })
    retrying = state[`b${tick % RING}`] ?? 0
    delete next[`b${tick % RING}`]
  }
  next.tick = tick + 1

  const sent = offered + retrying
  const out = asFlow(sent, readRatio)
  return {
    out: children.map(() => out),
    fanout: 'all',
    state: next,
    source: { offered, retries, retryShare: share },
    metrics: { lambda: sent, mu: Infinity, rho: 0, queue: 0, served: sent, dropped: 0, baseMs: 0, latencyMs: 0,
      note: sent > offered * 1.005 ? `+${Math.round((sent / offered - 1) * 100)}% retries` : undefined },
  }
}
