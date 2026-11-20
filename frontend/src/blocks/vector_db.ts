import { type BlockDef, replicas, capacity, latency, timeout } from './types'

// Approximate nearest-neighbour search: ~1k queries/s per node. Estimate.
export const vector_db: BlockDef = {
  type: 'vector_db', label: 'Vector DB', icon: '🧭', category: 'data', simBehavior: 'kv', cost: 0.5,
  params: [replicas(1), capacity(1000), latency(20), timeout(2000)],
}
