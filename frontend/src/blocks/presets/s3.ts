import { blob } from '../blob'
import { presetBlock } from './preset'
import { awsPrices } from './urls'

const perf = 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html'

export const s3 = presetBlock({
  id: 's3', base: blob, label: 'S3', badge: 'S3',
  params: { capacity_rps: 11_000, base_latency_ms: 100 },
  cost: 0, requestCost: { read: 0.4, write: 5 },
  facts: [
    'Per key prefix: at least 11,000 GET/s and 3,500 PUT/s; more prefixes scale further',
    'First byte in roughly 100-200 ms for small objects',
    'Pay per request (and per GB stored)',
  ],
  sources: {
    capacity_rps: `${perf} ("at least 3,500 PUT/COPY/POST/DELETE or 11,000 GET/HEAD requests per second")`,
    base_latency_ms: `${perf} ("roughly 100-200 milliseconds")`,
    requestCost: `${awsPrices('AmazonS3')}: GET $0.0004 per 1,000, PUT $0.005 per 1,000`,
  },
  estimates: [],
  notes: 'The sim has one capacity number, so the 3,500 PUT/s write limit is not enforced separately. Storage and transfer are not priced.',
})
