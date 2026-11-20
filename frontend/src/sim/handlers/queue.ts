// Queue: accepts up to capacity_rps, consumers (the children) compete for messages and
// drain at their combined μ. The producer only waits for the enqueue, so its latency stays
// low even when the backlog grows: that's the point of a queue.
import type { Handler } from '../types'
import { fmtCount } from '../../display'
import { asFlow, mixOf, muOf, num, total } from './common'

export const queue: Handler = ({ node, inbound, children, state, dt }) => {
  const lambda = total(inbound)
  const cap = node.killed ? 0 : num(node.params.capacity_rps, Infinity)
  const accepted = Math.min(lambda, cap)
  const drain = node.killed ? [] : children.map(muOf)
  const drainTotal = drain.reduce((a, b) => a + b, 0)
  const available = (state.queue ?? 0) + accepted * dt
  const outRate = Math.min(available / dt, drainTotal)
  const backlog = available - outRate * dt
  const mix = mixOf(inbound, state)
  const baseMs = num(node.params.base_latency_ms, 0)
  return {
    out: children.map((_, i) => asFlow(drainTotal > 0 ? (outRate * drain[i]) / drainTotal : 0, mix)),
    fanout: 'async',
    state: { queue: backlog, mix },
    metrics: { lambda, mu: cap, rho: cap > 0 ? lambda / cap : 0, queue: backlog, served: accepted,
      dropped: lambda - accepted, baseMs, latencyMs: baseMs,
      note: backlog >= 1 ? `${fmtCount(backlog)} waiting` : undefined },
  }
}
