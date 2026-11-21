import { type BlockDef, replicas, capacity, latency, timeout } from './types'

// Full-text search: ~2k queries/s per node, tens of ms each. Estimate.
export const search: BlockDef = {
  type: 'search', label: 'Search index', icon: '🔍', category: 'data', simBehavior: 'kv', cost: 0.4, shape: 'cylinder',
  params: [replicas(2), capacity(2000), latency(30), timeout(2000)],
}
