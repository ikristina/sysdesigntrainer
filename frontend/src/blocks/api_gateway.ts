import { type BlockDef, replicas, capacity, latency } from './types'

// Gateway = balancer plus auth/rate limiting. Requests above rate_limit_rps are dropped.
export const api_gateway: BlockDef = {
  type: 'api_gateway', label: 'API gateway', category: 'traffic', simBehavior: 'gateway', cost: 0.05, shape: 'diamond',
  params: [
    { key: 'rate_limit_rps', label: 'Rate limit', default: 10_000, min: 1, max: 10_000_000, unit: 'rps' },
    replicas(1), capacity(20_000), latency(5),
  ],
}
