import { type BlockDef, capacity, latency } from './types'

// Accepts up to capacity_rps; consumers are the downstream workers. ~3k msg/s: estimate.
export const queue: BlockDef = {
  type: 'queue', label: 'Queue', category: 'async', simBehavior: 'queue', cost: 0.05, shape: 'pipe',
  params: [capacity(3000), latency(10)],
}
