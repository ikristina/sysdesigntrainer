import { type BlockDef, capacity, latency } from './types'

// Log-based stream. Each downstream block is its own consumer group and reads every message;
// partitions cap how many of a group's replicas can work at once. ~1k msg/s per partition: estimate.
export const stream: BlockDef = {
  type: 'stream', label: 'Stream', category: 'async', simBehavior: 'stream', cost: 0.2, shape: 'lanes',
  params: [
    { key: 'partitions', label: 'Partitions', default: 6, min: 1, max: 1000, int: true },
    { ...capacity(1000), label: 'Capacity / partition' },
    latency(10),
  ],
}
