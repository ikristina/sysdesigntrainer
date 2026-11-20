import { type BlockDef, timeout } from './types'

// Where traffic comes from. Load itself is a global control (Phase 2); retries live here
// because they are a client decision and they are what turns overload into a retry storm.
export const client: BlockDef = {
  type: 'client', label: 'Client', icon: '🖥️', category: 'edge', simBehavior: 'client', cost: 0,
  params: [
    { key: 'retries', label: 'Retries', default: 1, min: 0, max: 5, int: true },
    timeout(2000),
  ],
}
