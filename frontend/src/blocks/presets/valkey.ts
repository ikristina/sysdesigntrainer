import { cache } from '../cache'
import { presetBlock } from './preset'
import { awsPrices } from './urls'

export const valkey = presetBlock({
  id: 'valkey', base: cache, label: 'Valkey', badge: 'VK',
  params: { capacity_rps: 100_000 },
  cost: 0.1752,
  facts: [
    'Open-source fork of Redis: same commands, persistence and replication',
    'Valkey 8 moves more work to I/O threads; the main thread still runs commands',
    'About 20% cheaper than Redis OSS per ElastiCache node',
  ],
  sources: {
    cost: `${awsPrices('AmazonElastiCache')}: ElastiCache Valkey cache.r7g.large, $0.1752/node-hr`,
    capacity_rps: 'https://valkey.io/blog/unlock-one-million-rps/ (up to 1.19M req/s with 8 I/O threads on a 64-core c7g.16xlarge)',
  },
  estimates: ['capacity_rps'],
  notes: 'capacity_rps 100k is an estimate, kept equal to Redis for a similar small node; the 1.2M vendor figure is on much bigger hardware.',
})
