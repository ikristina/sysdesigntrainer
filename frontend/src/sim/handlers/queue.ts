// Queue: accepts up to capacity_rps, consumers (the children) compete for messages and
// drain at their combined μ. The producer only waits for the enqueue, so its latency stays
// low even when the backlog grows: that's the point of a queue.
// At-least-once: a message a consumer fails on (its own overload, or a slow or dead block behind
// it) isn't lost; it goes back on the queue (like an SQS visibility timeout running out). So the
// backlog shows the real shortfall, and the queue ends up draining at the rate work completes.
import type { Handler } from '../types'
import { fmtCount } from '../../display'
import { asFlow, backlogNote, mixOf, muOf, num, total } from './common'

export const queue: Handler = ({ node, inbound, children, childFail, state, dt }) => {
  const lambda = total(inbound)
  const cap = node.killed ? 0 : num(node.params.capacity_rps, Infinity)
  // Redelivered messages use the queue's capacity too (they're received again), ahead of new sends.
  const redelivered = children.reduce((a, c, i) => a + (state[`sent:${c.id}`] ?? 0) * (childFail[i] ?? 0), 0)
  const accepted = Math.min(lambda, Math.max(0, cap - redelivered))
  const drain = node.killed ? [] : children.map(muOf)
  const drainTotal = drain.reduce((a, b) => a + b, 0)
  const available = (state.queue ?? 0) + (accepted + redelivered) * dt
  const outRate = Math.min(available / dt, drainTotal)
  const backlog = available - outRate * dt
  const mix = mixOf(inbound, state)
  const baseMs = num(node.params.base_latency_ms, 0)
  const sent = children.map((_, i) => (drainTotal > 0 ? (outRate * drain[i]) / drainTotal : 0))
  return {
    out: sent.map((r) => asFlow(r, mix)),
    fanout: 'async',
    state: { queue: backlog, mix, ...Object.fromEntries(sent.map((r, i) => [`sent:${children[i].id}`, r])) },
    metrics: { lambda, mu: cap, rho: cap > 0 ? (lambda + redelivered) / cap : 0, queue: backlog, served: accepted,
      dropped: lambda - accepted, baseMs, latencyMs: baseMs, redelivered,
      note: backlogNote(backlog >= 1 && `${fmtCount(backlog)} waiting`, redelivered) },
  }
}
