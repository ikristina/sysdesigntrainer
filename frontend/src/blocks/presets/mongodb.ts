import { siMongodb } from 'simple-icons'
import { kv } from '../kv'
import { presetBlock } from './preset'

export const mongodb = presetBlock({
  id: 'mongodb', base: kv, label: 'MongoDB', logo: siMongodb,
  params: { capacity_rps: 5000 },
  cost: 0.54,
  facts: [
    'Document store: one primary per shard takes writes',
    'Default write concern is majority',
  ],
  sources: {
    cost: 'https://www.mongodb.com/pricing (Atlas M30, 2 vCPU / 8 GB, $0.54/hr; one price for all clouds)',
    write_concern: 'https://www.mongodb.com/docs/manual/reference/write-concern/',
  },
  estimates: ['capacity_rps'],
  notes: 'No official throughput figure. capacity_rps 5k ops/s is an estimate for an M30-class node (range 1k-10k).',
})
