// Multi-writer database with consensus replication (CockroachDB-style). Every node takes writes,
// but each write is applied on replication_factor replicas and waits for a majority of them:
// - capacity: reads + replication_factor × writes must fit in nodes × capacity_rps
// - latency: writes add one quorum round trip, cross-region when the replicas span regions.
// ponytail: the block stands for the whole cluster. Placed outside any region it "spans" them, so
// a region kill doesn't take it down; it should be up only while a majority of regions is.
import type { Handler } from '../types'
import { CROSS_AZ_MS, CROSS_REGION_MS, num, total } from './common'
import { service } from './service'

export const consensus: Handler = (input) => {
  const { node, inbound } = input
  const rf = num(node.params.replication_factor, 3)
  const quorumMs = num(node.params.regions, 1) >= 3 ? CROSS_REGION_MS : CROSS_AZ_MS
  const work = { read: inbound.read, write: inbound.write * rf }
  const r = service({ ...input, inbound: work })
  const lambda = total(inbound), scale = total(work) > 0 ? lambda / total(work) : 1
  const writeShare = lambda > 0 ? inbound.write / lambda : 0
  r.metrics = {
    ...r.metrics, lambda, served: r.metrics.served * scale, dropped: r.metrics.dropped * scale,
    baseMs: r.metrics.baseMs + writeShare * quorumMs, latencyMs: r.metrics.latencyMs + writeShare * quorumMs,
    note: `writes +${quorumMs} ms quorum`,
  }
  return r
}
