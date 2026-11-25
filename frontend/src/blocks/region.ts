import { type BlockDef } from './types'

// Visual container. Edges that cross regions will add latency in Phase 2.
export const region: BlockDef = {
  type: 'region', label: 'Region', category: 'grouping', simBehavior: 'none', cost: 0,
  params: [{ key: 'name', label: 'Name', default: 'us-east-1' }],
}
