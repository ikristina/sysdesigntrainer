// Shapes of the block registry. A block type is plain data: the canvas,
// the param panel and (Phase 2) the simulator all read these definitions.

export type Category =
  | 'edge' | 'traffic' | 'compute' | 'data' | 'cache' | 'async' | 'ai' | 'grouping'

export type ParamValue = number | string

/** Outline drawn on the canvas (canvas/shapes.ts). cylinder1/2 = a cylinder with 1 or 2 bands. */
export type Shape = 'box' | 'rounded' | 'lambda' | 'monitor' | 'cloud' | 'diamond'
  | 'cylinder' | 'cylinder1' | 'cylinder2' | 'bucket' | 'cache' | 'pipe' | 'lanes' | 'chip'

export type ParamDef = {
  key: string
  label: string
  default: ParamValue
  min?: number
  max?: number
  int?: boolean        // whole numbers only (replicas, partitions, ...)
  unit?: string
  options?: string[]   // string param with a fixed set of choices -> dropdown
}

export type BlockDef = {
  type: string
  label: string
  icon: string
  category: Category
  params: ParamDef[]
  simBehavior: string  // which simulator handler runs this block (stub until Phase 2)
  cost: number         // USD per replica-hour, order-of-magnitude estimate
  shape?: Shape        // default 'box'
  costPer?: 'partition' // cost is per partition/shard (Kinesis) instead of per replica
  requestCost?: { read: number; write: number } // USD per million requests arriving at the block (SQS, DynamoDB, S3)
}

// Returns an error message, or null if the value is OK for this param.
export function validateParam(def: ParamDef, value: ParamValue): string | null {
  if (typeof def.default === 'string') {
    if (typeof value !== 'string') return 'must be text'
    if (def.options && !def.options.includes(value)) return `must be one of ${def.options.join(', ')}`
    return null
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a number'
  if (def.int && !Number.isInteger(value)) return 'must be a whole number'
  if (def.min !== undefined && value < def.min) return `must be at least ${def.min}`
  if (def.max !== undefined && value > def.max) return `must be at most ${def.max}`
  return null
}

// Common params from the spec, shared by most blocks.
export const replicas = (d = 1): ParamDef =>
  ({ key: 'replicas', label: 'Replicas', default: d, min: 1, max: 100, int: true })
export const capacity = (d: number): ParamDef =>
  ({ key: 'capacity_rps', label: 'Capacity / replica', default: d, min: 1, max: 10_000_000, unit: 'rps' })
export const latency = (d: number): ParamDef =>
  ({ key: 'base_latency_ms', label: 'Base latency', default: d, min: 0, max: 60_000, unit: 'ms' })
export const timeout = (d = 1000): ParamDef =>
  ({ key: 'timeout_ms', label: 'Timeout', default: d, min: 1, max: 120_000, unit: 'ms' })
