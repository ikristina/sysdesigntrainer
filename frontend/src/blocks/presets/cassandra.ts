import { siApachecassandra } from 'simple-icons'
import { wide_column } from '../wide_column'
import { presetBlock } from './preset'

export const cassandra = presetBlock({
  id: 'cassandra', base: wide_column, label: 'Cassandra', logo: siApachecassandra,
  params: { capacity_rps: 20_000 },
  cost: 0.172,
  facts: [
    'Writes append to a log and memory (LSM): cheap writes, no read-before-write',
    'Every node takes writes; QUORUM = a majority of replicas',
    'Self-managed: you run the nodes',
  ],
  sources: {
    cost: 'https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/us-east-1/index.csv (EC2 i4i.large Linux on-demand, $0.172/hr, effective 2026-11-01)',
    writes: 'https://cassandra.apache.org/doc/latest/cassandra/architecture/storage-engine.html',
    quorum: 'https://cassandra.apache.org/doc/latest/cassandra/architecture/dynamo.html',
  },
  estimates: ['capacity_rps'],
  notes: 'No official per-node figure. capacity_rps 20k ops/s is an estimate (writes 10k-50k per node, reads lower). Cost is one EC2 i4i.large per node; ops work is not priced.',
})
