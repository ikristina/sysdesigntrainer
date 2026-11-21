import { type BlockDef, replicas, capacity, latency, timeout } from './types'

// Hosted LLM: slow and expensive. ~5 concurrent requests/s per GPU replica, ~2 s each. Estimates.
export const llm: BlockDef = {
  type: 'llm', label: 'LLM service', icon: '✨', category: 'ai', simBehavior: 'service', cost: 3, shape: 'chip',
  params: [
    replicas(1), capacity(5), latency(2000),
    { key: 'tokens_per_s', label: 'Tokens / s', default: 50, min: 1, max: 10_000, unit: 'tok/s' },
    timeout(30_000),
  ],
}
