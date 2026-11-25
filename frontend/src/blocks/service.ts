import { type BlockDef, replicas, capacity, latency, timeout } from './types'

// ~1k rps per replica: a JSON API on ~2 vCPU doing light work. Estimate.
export const service: BlockDef = {
  type: 'service', label: 'Service', category: 'compute', simBehavior: 'service', cost: 0.1,
  params: [replicas(2), capacity(1000), latency(20), timeout(1000)],
}
