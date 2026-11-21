import { stream } from '../stream'
import { presetBlock } from './preset'
import { awsPrices } from './urls'

export const kinesis = presetBlock({
  id: 'kinesis', base: stream, label: 'Kinesis', badge: 'AWS',
  params: { capacity_rps: 1000 },
  cost: 0.015, costPer: 'partition', requestCost: { read: 0.014, write: 0.014 },
  facts: [
    'Partitions are shards: 1,000 records/s (1 MB/s) in per shard',
    'Pay per shard-hour plus per PUT (25 KB units)',
    'Keeps records 24 h by default (up to 365 days), so consumers can replay',
  ],
  sources: {
    capacity_rps: 'https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html ("up to 1 MB/sec or 1,000 records/sec write throughput")',
    cost: `${awsPrices('AmazonKinesis')}: $0.015 per provisioned shard-hour`,
    requestCost: `${awsPrices('AmazonKinesis')}: $0.014 per million PUT payload units`,
  },
  estimates: [],
  notes: 'Provisioned mode. Records are assumed under 25 KB (one payload unit each). Reads are 2 MB/s per shard and not billed per request.',
})
