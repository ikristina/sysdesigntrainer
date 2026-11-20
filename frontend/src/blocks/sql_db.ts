import { type BlockDef, capacity, latency, timeout } from './types'

// One primary takes all writes; reads spread over primary + read replicas.
// ~5k simple indexed queries/s per node: estimate. pool_size 100 = Postgres default max_connections.
export const sql_db: BlockDef = {
  type: 'sql_db', label: 'SQL DB', icon: '🐘', category: 'data', simBehavior: 'sql', cost: 0.5,
  params: [
    { key: 'read_replicas', label: 'Read replicas', default: 0, min: 0, max: 15, int: true },
    capacity(5000), latency(5),
    { key: 'pool_size', label: 'Connection pool', default: 100, min: 1, max: 10_000, int: true },
    timeout(1000),
  ],
}
