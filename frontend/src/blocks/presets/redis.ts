import { siRedis } from 'simple-icons'
import { cache } from '../cache'
import { presetBlock } from './preset'
import { awsPrices, R7G_LARGE_GB, r7gLargeMemory } from './urls'

export const redis = presetBlock({
  id: 'redis', base: cache, label: 'Redis', logo: siRedis,
  params: { capacity_rps: 100_000 },
  cost: 0.219,
  facts: [
    'Runs commands on one thread per node (I/O threads only read, parse and write sockets)',
    'Persistence: none, RDB snapshots, AOF log, or both',
    'Async primary-replica replication: a replica takes over when a node dies',
  ],
  memoryGb: R7G_LARGE_GB,
  sources: {
    memoryGb: r7gLargeMemory,
    cost: `${awsPrices('AmazonElastiCache')}: ElastiCache Redis OSS cache.r7g.large, $0.219/node-hr`,
    capacity_rps: 'https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/benchmarks/ (~180k SET/s, no pipelining, loopback)',
  },
  estimates: ['capacity_rps'],
  notes: 'capacity_rps 100k is an estimate below the ~180k/s loopback benchmark, to leave room for a real network. Latency is the generic 1 ms estimate (benchmark p50 0.14 ms on loopback).',
})
