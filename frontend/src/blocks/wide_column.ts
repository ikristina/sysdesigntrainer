import { type BlockDef, replicas, capacity, latency, timeout } from './types'

// Cassandra-style wide-column store: write-optimized. ~10k ops/s per node: estimate.
export const wide_column: BlockDef = {
  type: 'wide_column', label: 'Wide-column', icon: '🗂️', category: 'data', simBehavior: 'kv', cost: 0.4,
  params: [replicas(3), capacity(10_000), latency(8), timeout(1000)],
}
