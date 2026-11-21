import { siMysql } from 'simple-icons'
import { sql_db } from '../sql_db'
import { presetBlock } from './preset'
import { awsPrices } from './urls'

export const mysql = presetBlock({
  id: 'mysql', base: sql_db, label: 'MySQL', logo: siMysql,
  params: { capacity_rps: 3000, pool_size: 151 },
  cost: 0.215,
  facts: [
    'One primary takes every write; read replicas serve reads with replication lag',
    'max_connections defaults to 151',
  ],
  sources: {
    cost: `${awsPrices('AmazonRDS')}: RDS MySQL db.r6g.large Single-AZ, $0.215/hr`,
    pool_size: 'https://dev.mysql.com/doc/refman/8.4/en/server-system-variables.html (max_connections default 151)',
  },
  estimates: ['capacity_rps'],
  notes: 'No official throughput figure. capacity_rps 3k simple queries/s is an estimate, same class as Postgres. Storage is not priced.',
})
