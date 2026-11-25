import { type BlockDef, replicas, capacity, latency, timeout } from './types'

// Key-value / document store, partitioned. ~10k ops/s per node: estimate.
export const kv: BlockDef = {
  type: 'kv', label: 'NoSQL / KV', category: 'data', simBehavior: 'kv', cost: 0.3, shape: 'cylinder',
  params: [replicas(3), capacity(10_000), latency(5), timeout(1000)],
}
