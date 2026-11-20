// Client: where traffic starts. Sends its share of the global rps, plus retries:
// with failure share f last tick and r retries, it sends offered × (1 + f + f² + … + f^r).
// That feedback is what turns an overload into a retry storm.
import type { Handler } from '../types'
import { asFlow, num } from './common'

export const client: Handler = ({ node, offered, children, prevPathFail: f, readRatio }) => {
  const retries = num(node.params.retries, 0)
  let sent = 0
  for (let k = 0; k <= retries; k++) sent += offered * f ** k
  const out = asFlow(sent, readRatio)
  return {
    out: children.map(() => out),
    fanout: 'all',
    state: {},
    source: { offered, retries },
    metrics: { lambda: sent, mu: Infinity, rho: 0, queue: 0, served: sent, dropped: 0, baseMs: 0, latencyMs: 0,
      note: sent > offered * 1.005 ? `+${Math.round((sent / offered - 1) * 100)}% retries` : undefined },
  }
}
