import { type BlockDef, replicas, capacity, latency, timeout } from './types'

// Serverless: replicas = max concurrent instances. Cold starts add latency on scale-up. Estimates.
export const fn: BlockDef = {
  type: 'function', label: 'Function', icon: 'λ', category: 'compute', simBehavior: 'service', cost: 0.02,
  params: [
    { ...replicas(100), label: 'Max instances', max: 10_000 },
    capacity(10), latency(50),
    { key: 'cold_start_ms', label: 'Cold start', default: 250, min: 0, max: 10_000, unit: 'ms' },
    timeout(3000),
  ],
}
