import { type BlockDef, latency } from './types'

// Resolution is cached by clients, so DNS mostly adds latency on cold lookups. Estimate.
export const dns: BlockDef = {
  type: 'dns', label: 'DNS', category: 'edge', simBehavior: 'passthrough', cost: 0,
  params: [latency(20)],
}
