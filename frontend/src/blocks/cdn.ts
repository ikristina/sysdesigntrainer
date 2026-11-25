import { type BlockDef, capacity, latency } from './types'

// Managed edge cache: capacity is effectively unlimited for our scale (estimate).
// Real CDN pricing is per GB transferred; the hourly cost is a rough stand-in.
export const cdn: BlockDef = {
  type: 'cdn', label: 'CDN', category: 'edge', simBehavior: 'cache', cost: 0.1, shape: 'cloud',
  params: [
    { key: 'hit_ratio', label: 'Hit ratio', default: 0.9, min: 0, max: 1 },
    capacity(1_000_000), latency(20),
  ],
}
