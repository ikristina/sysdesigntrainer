// Generic server: a queue in front of replicas × capacity_rps (each replica its own servers, see latencyOf). Each request calls every child.
// Used by services, workers, functions, AI services, the NoSQL-style stores and DNS.
import type { Handler } from '../types'
import { asFlow, DEFAULT_TIMEOUT_MS, latencyOf, mixOf, muOf, perReplica, num, queueStep, total } from './common'

export const service: Handler = ({ node, inbound, children, state, dt }) => {
  const lambda = total(inbound)
  const mu = muOf(node)
  const baseMs = num(node.params.base_latency_ms, 0)
  const q = queueStep(lambda, mu, state.queue ?? 0, num(node.params.timeout_ms, DEFAULT_TIMEOUT_MS), dt)
  const rho = mu > 0 ? lambda / mu : 0
  const mix = mixOf(inbound, state)
  const out = asFlow(q.out, mix)
  return {
    out: children.map(() => out),
    fanout: 'all',
    state: { queue: q.queue, mix },
    metrics: { lambda, mu, rho, queue: q.queue, served: q.out, dropped: q.dropped, baseMs,
      latencyMs: latencyOf(baseMs, rho, q.waitMs, perReplica(node)) },
  }
}
