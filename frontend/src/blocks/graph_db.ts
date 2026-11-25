import { type BlockDef, replicas, capacity, latency, timeout } from './types'

// Graph traversals are expensive per query: ~2k rps per node. Estimate.
export const graph_db: BlockDef = {
  type: 'graph_db', label: 'Graph DB', category: 'data', simBehavior: 'kv', cost: 0.5, shape: 'cylinder',
  params: [replicas(1), capacity(2000), latency(15), timeout(1000)],
}
