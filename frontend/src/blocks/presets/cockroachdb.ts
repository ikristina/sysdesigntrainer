import { siCockroachlabs } from 'simple-icons'
import { sql_db } from '../sql_db'
import { replicas } from '../types'
import { presetBlock } from './preset'

const docs = 'https://docs.cockroachlabs.com/docs/stable'

export const cockroachdb = presetBlock({
  id: 'cockroachdb', base: sql_db, label: 'CockroachDB', logo: siCockroachlabs, simBehavior: 'consensus',
  params: { capacity_rps: 3000 },
  dropParams: ['read_replicas', 'pool_size'],
  addParams: [
    replicas(3),
    { key: 'replication_factor', label: 'Replication factor', default: 3, min: 3, max: 7, int: true },
    { key: 'regions', label: 'Regions', default: 1, min: 1, max: 9, int: true },
  ],
  cost: 0.184,
  facts: [
    'Every node takes writes; each write waits for a majority of its replicas (Raft)',
    'With 3+ regions it survives a region loss, but every write pays a cross-region round trip',
    'Place it outside the region boxes: it stands for the whole multi-region cluster',
  ],
  sources: {
    cost: 'https://www.cockroachlabs.com/pricing/ (Standard $0.092 per vCPU-hour × 2 vCPU)',
    replication_factor: `${docs}/configure-replication-zones (num_replicas default 3)`,
    regions: `${docs}/multiregion-survival-goals ("To survive region failures, you must add at least 3 database regions")`,
  },
  estimates: ['capacity_rps'],
  notes: 'capacity_rps 3k per node is an estimate, kept equal to Postgres. The quorum delay is the sim\'s 70 ms cross-region estimate (docs give no ms figure; 1 ms in one region). The pricing page also shows "from $0.057 / vCPU-hr"; the plan card\'s $0.092 is used. Region survival raises the replica count to 5: set replication_factor to 5.',
})
