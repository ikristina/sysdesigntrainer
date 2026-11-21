import { kv } from '../kv'
import { presetBlock } from './preset'
import { awsPrices } from './urls'

const partitionDocs = 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-partition-key-design.html'

export const dynamodb = presetBlock({
  id: 'dynamodb', base: kv, label: 'DynamoDB', badge: 'DDB', simBehavior: 'partitioned',
  params: { capacity_rps: 40_000, base_latency_ms: 5 },
  dropParams: ['replicas'],
  addParams: [
    { key: 'partition_read_rps', label: 'Reads / partition', default: 6000, min: 1, max: 1_000_000, unit: 'rps' },
    { key: 'partition_write_rps', label: 'Writes / partition', default: 1000, min: 1, max: 1_000_000, unit: 'rps' },
  ],
  cost: 0, requestCost: { read: 0.0625, write: 0.625 },
  facts: [
    'Scales out by itself (on-demand), but one key lives on one partition',
    'Per partition: 3,000 read units and 1,000 write units per second, so a hot key throttles',
    'No hourly cost on demand: pay per read and write',
  ],
  sources: {
    capacity_rps: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html (40,000 read/write units per table, default quota)',
    partition_read_rps: `${partitionDocs} (3,000 read units per partition; 1 unit = 2 eventually consistent reads up to 4 KB)`,
    partition_write_rps: `${partitionDocs} (1,000 write units per partition; 1 unit = 1 write up to 1 KB)`,
    base_latency_ms: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html ("single-digit millisecond performance")',
    requestCost: `${awsPrices('AmazonDynamoDB')}: $0.125 per million read units (an eventually consistent read is half a unit), $0.625 per million write units`,
  },
  estimates: ['base_latency_ms'],
  notes: 'Assumes items up to 1 KB and eventually consistent reads (the default). base_latency_ms 5 is an estimate inside "single-digit ms". The table quota can be raised. Storage is not priced.',
})
