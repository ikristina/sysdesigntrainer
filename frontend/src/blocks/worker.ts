import { type BlockDef, replicas, capacity, latency, timeout } from './types'

// Background jobs are heavier than API calls: ~200 jobs/s per replica. Estimate.
export const worker: BlockDef = {
  type: 'worker', label: 'Worker', icon: '🛠️', category: 'compute', simBehavior: 'service', cost: 0.1,
  params: [replicas(2), capacity(200), latency(100), timeout(30_000)],
}
