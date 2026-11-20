// Cache (and CDN): hits are served here, misses and writes go downstream.
// write_mode 'invalidate' deletes keys on write, so write-heavy traffic lowers the hit ratio.
import type { Handler } from '../types'
import { DEFAULT_TIMEOUT_MS, latencyOf, mixOf, muOf, num, queueStep, total } from './common'

export const cache: Handler = ({ node, inbound, children, state, dt }) => {
  const lambda = total(inbound)
  const mu = muOf(node)
  const baseMs = num(node.params.base_latency_ms, 0)
  const q = queueStep(lambda, mu, state.queue ?? 0, DEFAULT_TIMEOUT_MS, dt)
  const rho = mu > 0 ? lambda / mu : 0
  const mix = mixOf(inbound, state)
  // ponytail: invalidation scales hits by the read share; a real model needs key-level reuse.
  const hit = num(node.params.hit_ratio, 0) * (node.params.write_mode === 'invalidate' ? mix : 1)
  const reads = q.out * mix, writes = q.out * (1 - mix)
  const out = { read: reads * (1 - hit), write: writes }
  return {
    out: children.map(() => out),
    fanout: 'all',
    state: { queue: q.queue, mix },
    metrics: { lambda, mu, rho, queue: q.queue, served: q.out, dropped: q.dropped, baseMs,
      latencyMs: latencyOf(baseMs, rho, q.waitMs), note: `hit ${Math.round(hit * 100)}%` },
  }
}
