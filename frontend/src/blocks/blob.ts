import { type BlockDef, capacity, latency, timeout } from './types'

// Object storage. 11,000 GET/s per key prefix is the S3 documented baseline
// (AWS S3 performance guidelines). Latency and hourly cost are estimates.
export const blob: BlockDef = {
  type: 'blob', label: 'Blob storage', category: 'data', simBehavior: 'kv', cost: 0.05, shape: 'bucket',
  params: [capacity(11000), latency(50), timeout(5000)],
}
