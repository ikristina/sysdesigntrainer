// Stream (log): every child is a separate consumer group and reads every message.
// Within a group, each partition has one owner, so partitions cap parallelism. Spread over fewer
// consumers, some own one partition more than the rest (`hot`) and fall behind first, even when
// the group's total capacity is enough. Each group has its own lag; `hot:` holds those owners' part.
// At-least-once: what a group fails on isn't committed, so it's read again (adds to that group's lag).
import type { Handler } from '../types'
import { asFlow, backlogNote, mixOf, num, total } from './common'
import { fmtCount } from '../../display'

export const stream: Handler = ({ node, inbound, children, childFail, state, dt }) => {
  const p = node.params
  const partitions = num(p.partitions, 1)
  const lambda = total(inbound)
  const cap = node.killed ? 0 : partitions * num(p.capacity_rps, Infinity)
  const accepted = Math.min(lambda, cap)
  const mix = mixOf(inbound, state)
  const next: Record<string, number> = { mix }
  let maxLag = 0, redelivered = 0
  const out = children.map((c, i) => {
    const owners = Math.min(num(c.params.replicas, 1), partitions)
    const hot = partitions % owners, each = Math.floor(partitions / owners) // `hot` owners hold each + 1
    const perOwner = node.killed || c.killed ? 0 : num(c.params.capacity_rps, Infinity)
    const redeliver = (state[`sent:${c.id}`] ?? 0) * (childFail[i] ?? 0)
    redelivered += redeliver
    const inflow = (accepted + redeliver) * dt
    const available = (state[`lag:${c.id}`] ?? 0) + inflow
    const hotAvail = hot ? (state[`hot:${c.id}`] ?? 0) + inflow * hot * (each + 1) / partitions : 0
    const hotRate = Math.min(hotAvail / dt, hot * perOwner)
    const rate = hotRate + Math.min((available - hotAvail) / dt, (owners - hot) * perOwner)
    next[`lag:${c.id}`] = available - rate * dt
    next[`hot:${c.id}`] = hotAvail - hotRate * dt
    next[`sent:${c.id}`] = rate
    maxLag = Math.max(maxLag, next[`lag:${c.id}`])
    return asFlow(rate, mix)
  })
  const baseMs = num(p.base_latency_ms, 0)
  return {
    out, fanout: 'async', state: next,
    metrics: { lambda, mu: cap, rho: cap > 0 ? lambda / cap : 0, queue: maxLag, served: accepted,
      dropped: lambda - accepted, baseMs, latencyMs: baseMs, redelivered,
      note: backlogNote(maxLag >= 1 && `lag ${fmtCount(maxLag)} msgs`, redelivered) },
  }
}
