// Stream (log): every child is a separate consumer group and reads every message.
// Within a group, partitions cap parallelism: a group drains at
// min(its replicas, partitions) × its capacity_rps per replica. Each group has its own lag.
import type { Handler } from '../types'
import { asFlow, mixOf, num, total } from './common'
import { fmtCount } from '../../display'

export const stream: Handler = ({ node, inbound, children, state, dt }) => {
  const p = node.params
  const partitions = num(p.partitions, 1)
  const lambda = total(inbound)
  const cap = node.killed ? 0 : partitions * num(p.capacity_rps, Infinity)
  const accepted = Math.min(lambda, cap)
  const mix = mixOf(inbound, state)
  const next: Record<string, number> = { mix }
  let maxLag = 0
  const out = children.map((c) => {
    const drain = node.killed || c.killed ? 0
      : Math.min(num(c.params.replicas, 1), partitions) * num(c.params.capacity_rps, Infinity)
    const available = (state[`lag:${c.id}`] ?? 0) + accepted * dt
    const rate = Math.min(available / dt, drain)
    next[`lag:${c.id}`] = available - rate * dt
    maxLag = Math.max(maxLag, next[`lag:${c.id}`])
    return asFlow(rate, mix)
  })
  const baseMs = num(p.base_latency_ms, 0)
  return {
    out, fanout: 'async', state: next,
    metrics: { lambda, mu: cap, rho: cap > 0 ? lambda / cap : 0, queue: maxLag, served: accepted,
      dropped: lambda - accepted, baseMs, latencyMs: baseMs,
      note: maxLag >= 1 ? `lag ${fmtCount(maxLag)} msgs` : undefined },
  }
}
