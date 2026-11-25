import { type BlockDef } from './types'

// Availability zone: a container that sits inside a region.
export const az: BlockDef = {
  type: 'az', label: 'AZ', category: 'grouping', simBehavior: 'none', cost: 0,
  params: [{ key: 'name', label: 'Name', default: 'us-east-1a' }],
}
