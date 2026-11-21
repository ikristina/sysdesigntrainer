import { cache } from '../cache'
import { presetBlock } from './preset'
import { awsPrices, R7G_LARGE_GB, r7gLargeMemory } from './urls'

export const memcached = presetBlock({
  id: 'memcached', base: cache, label: 'Memcached', badge: 'Mc',
  params: { capacity_rps: 200_000 },
  dropParams: ['persistence', 'replication'],
  cost: 0.219,
  facts: [
    'Multi-threaded: 4 worker threads by default (-t)',
    'No replication and no persistence: a lost node is lost keys, a restart starts cold',
    'Only simple get/set: no data structures',
  ],
  memoryGb: R7G_LARGE_GB,
  sources: {
    memoryGb: r7gLargeMemory,
    cost: `${awsPrices('AmazonElastiCache')}: ElastiCache Memcached cache.r7g.large, $0.219/node-hr`,
    threads: 'https://github.com/memcached/memcached/wiki/ConfiguringServer ("By default 4 threads are allocated")',
    replication: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/SelectEngine.html',
  },
  estimates: ['capacity_rps'],
  notes: 'No official throughput figure. capacity_rps 200k is an estimate: same order as Redis, higher because it spreads commands over threads. Warm restart (1.5.18+) survives clean restarts only, not crashes, so the sim treats every restart as cold.',
})
