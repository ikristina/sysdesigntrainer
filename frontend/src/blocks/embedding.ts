import { type BlockDef, replicas, capacity, latency, timeout } from './types'

// Embeddings are much cheaper than generation: ~200 rps per replica. Estimate.
export const embedding: BlockDef = {
  type: 'embedding', label: 'Embeddings', icon: '🧬', category: 'ai', simBehavior: 'service', cost: 1, shape: 'sparkle',
  params: [replicas(1), capacity(200), latency(50), timeout(5000)],
}
