import { siPostgresql } from 'simple-icons'
import { sql_db } from '../sql_db'
import { presetBlock } from './preset'
import { awsPrices } from './urls'

export const postgres = presetBlock({
  id: 'postgres', base: sql_db, label: 'Postgres', logo: siPostgresql,
  params: { capacity_rps: 3000, pool_size: 100 },
  cost: 0.225,
  facts: [
    'One primary takes every write; read replicas serve reads with replication lag',
    'max_connections defaults to 100',
    'Joins and transactions across tables',
  ],
  sources: {
    cost: `${awsPrices('AmazonRDS')}: RDS PostgreSQL db.r6g.large Single-AZ, $0.225/hr`,
    pool_size: 'https://www.postgresql.org/docs/current/runtime-config-connection.html ("The default is typically 100 connections")',
    writer: 'https://www.postgresql.org/docs/current/high-availability.html',
  },
  estimates: ['capacity_rps'],
  notes: 'No official throughput figure. capacity_rps 3k simple queries/s is an estimate for a 2 vCPU node (range 1k-5k). Storage is not priced.',
})
