import { type BlockDef, capacity, latency, timeout } from './types'

// Object storage. 5,500 GET/s per key prefix is the S3 documented baseline
// (AWS S3 performance guidelines). Latency and hourly cost are estimates.
export const blob: BlockDef = {
  type: 'blob', label: 'Blob storage', icon: '🪣', category: 'data', simBehavior: 'kv', cost: 0.05,
  params: [capacity(5500), latency(50), timeout(5000)],
}
