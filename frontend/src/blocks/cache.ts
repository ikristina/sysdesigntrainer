import { type BlockDef, replicas, capacity, latency } from './types'

// In-memory cache: ~50k simple GETs/s per node, ~1 ms. Estimate.
export const cache: BlockDef = {
  type: 'cache', label: 'Cache', category: 'cache', simBehavior: 'cache', cost: 0.15,
  params: [
    replicas(1), capacity(50_000), latency(1),
    { key: 'hit_ratio', label: 'Hit ratio', default: 0.8, min: 0, max: 1 },
    { key: 'ttl_s', label: 'TTL', default: 300, min: 1, max: 86_400, unit: 's' },
    { key: 'eviction', label: 'Eviction', default: 'lru', options: ['lru', 'lfu', 'ttl'] },
    { key: 'write_mode', label: 'On write', default: 'invalidate', options: ['invalidate', 'write-through'] },
    // Survives a restart with its keys (rdb/aof reload from disk) or starts cold (none).
    { key: 'persistence', label: 'Persistence', default: 'none', options: ['none', 'rdb', 'aof'] },
    // A replica per node: failover keeps the keys, costs 2×.
    { key: 'replication', label: 'Replication', default: 'none', options: ['none', 'replica'] },
    // While it's down: fail every request (in the request path, or the store itself), or bypass:
    // the app treats it as a miss and goes to the next block (cache-aside), so all reads land there.
    { key: 'when_down', label: 'When down', default: 'fail', options: ['fail', 'bypass'] },
  ],
}
