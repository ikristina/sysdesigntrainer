// Cache (and CDN): hits are served here, misses and writes go downstream.
// write_mode 'invalidate' deletes keys on write, so write-heavy traffic lowers the hit ratio.
// Warmth (0-1) scales the hit ratio. A cache loses keys when:
// - it goes down with persistence 'none' (memory is gone; with rdb/aof it reloads from disk), or
// - its node count changes with replication 'none': keys are spread by hashing, so going from N to
//   N-1 nodes loses about 1/N of them (and N to N+1 remaps about 1/(N+1)). With a replica per
//   node, a lost node fails over and nothing is lost.
// It warms back up as misses refill it.
import type { Handler } from '../types'
import { DEFAULT_TIMEOUT_MS, latencyOf, mixOf, muOf, num, queueStep, total } from './common'

// ponytail: warm-up is a fixed 30 s time constant (estimate); a real one depends on the key
// count and the miss rate. Add a keyspace param if a lesson needs the real shape.
const WARM_S = 30

export const cache: Handler = ({ node, inbound, children, state, dt }) => {
  const lambda = total(inbound)
  const mu = muOf(node)
  const baseMs = num(node.params.base_latency_ms, 0)
  const q = queueStep(lambda, mu, state.queue ?? 0, DEFAULT_TIMEOUT_MS, dt)
  const rho = mu > 0 ? lambda / mu : 0
  const mix = mixOf(inbound, state)
  // ponytail: invalidation scales hits by the read share; a real model needs key-level reuse.
  const replicas = num(node.params.replicas, 1)
  const before = state.replicas ?? replicas
  let warm = state.warm ?? 1
  if (node.killed) {
    if ((node.params.persistence ?? 'none') === 'none') warm = 0
  } else {
    if (replicas !== before && node.params.replication !== 'replica') warm *= Math.min(before, replicas) / Math.max(before, replicas)
    warm += ((1 - warm) * dt) / WARM_S
  }
  const hit = num(node.params.hit_ratio, 0) * warm * (node.params.write_mode === 'invalidate' ? mix : 1)
  const reads = q.out * mix, writes = q.out * (1 - mix)
  const out = { read: reads * (1 - hit), write: writes }
  return {
    out: children.map(() => out),
    fanout: 'all',
    state: { queue: q.queue, mix, warm, replicas },
    metrics: { lambda, mu, rho, queue: q.queue, served: q.out, dropped: q.dropped, baseMs,
      latencyMs: latencyOf(baseMs, rho, q.waitMs, mu), hit, stale: reads * hit, note: `hit ${Math.round(hit * 100)}%` },
  }
}
