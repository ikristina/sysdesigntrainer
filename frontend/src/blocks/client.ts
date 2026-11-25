import { type BlockDef, timeout } from './types'

// Where traffic comes from. Load itself is a global control (Phase 2); retries live here
// because they are a client decision and they are what turns overload into a retry storm.
export const client: BlockDef = {
  type: 'client', label: 'Client', category: 'edge', simBehavior: 'client', cost: 0,
  params: [
    { key: 'retries', label: 'Retries', default: 1, min: 0, max: 5, int: true },
    // Retries as a share of requests at most (gRPC / Finagle-style retry budget). 'unlimited' = only `retries` caps them.
    { key: 'retry_budget', label: 'Retry budget', default: 'unlimited', options: ['unlimited', '20%', '10%'] },
    // 'exponential' = wait before each retry, with full jitter: retry k waits a random 0 to 2^(k-1) s.
    { key: 'backoff', label: 'Backoff', default: 'none', options: ['none', 'exponential'] },
    timeout(2000),
  ],
}
