import { type BlockDef, capacity, latency } from './types'

// Log-based stream: partitions cap consumer parallelism. ~1k msg/s per partition: estimate.
export const stream: BlockDef = {
  type: 'stream', label: 'Stream', icon: '🌊', category: 'async', simBehavior: 'stream', cost: 0.2,
  params: [
    { key: 'partitions', label: 'Partitions', default: 6, min: 1, max: 1000, int: true },
    { ...capacity(1000), label: 'Capacity / partition' },
    { key: 'consumers', label: 'Consumers', default: 3, min: 1, max: 1000, int: true },
    latency(10),
  ],
}
