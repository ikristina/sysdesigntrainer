import { type BlockDef, replicas, capacity, latency } from './types'

// ~50k rps per LB node and ~1 ms added latency: estimate for an L7 balancer.
export const load_balancer: BlockDef = {
  type: 'load_balancer', label: 'Load balancer', category: 'traffic', simBehavior: 'balancer', cost: 0.03, shape: 'diamond',
  params: [replicas(1), capacity(50_000), latency(1)],
}
