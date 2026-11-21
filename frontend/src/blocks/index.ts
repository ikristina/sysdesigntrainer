// The registry: every block type the app knows about.
// To add a block: create a file next to this one and add it to the `blocks` list.
import type { BlockDef, Category, ParamValue } from './types'
import { client } from './client'
import { dns } from './dns'
import { cdn } from './cdn'
import { load_balancer } from './load_balancer'
import { api_gateway } from './api_gateway'
import { service } from './service'
import { worker } from './worker'
import { fn } from './function'
import { sql_db } from './sql_db'
import { kv } from './kv'
import { wide_column } from './wide_column'
import { graph_db } from './graph_db'
import { search } from './search'
import { vector_db } from './vector_db'
import { blob } from './blob'
import { cache } from './cache'
import { queue } from './queue'
import { stream } from './stream'
import { llm } from './llm'
import { embedding } from './embedding'
import { region } from './region'
import { az } from './az'
import { presets } from './presets'

export const blocks: BlockDef[] = [
  client, dns, cdn, load_balancer, api_gateway, service, worker, fn,
  sql_db, kv, wide_column, graph_db, search, vector_db, blob,
  cache, queue, stream, llm, embedding, region, az,
  ...presets,
]

export const registry: Record<string, BlockDef> = Object.fromEntries(blocks.map((b) => [b.type, b]))

// Palette order, headings and accent colors (tokens.css).
export const categories: { id: Category; label: string; color: string }[] = [
  { id: 'edge', label: 'Edge', color: 'var(--flow-client)' },
  { id: 'traffic', label: 'Traffic', color: 'var(--flow-traffic)' },
  { id: 'compute', label: 'Compute', color: 'var(--flow-compute)' },
  { id: 'data', label: 'Data', color: 'var(--flow-sql)' },
  { id: 'cache', label: 'Cache', color: 'var(--flow-cache)' },
  { id: 'async', label: 'Async', color: 'var(--flow-async)' },
  { id: 'ai', label: 'AI', color: 'var(--flow-ai)' },
  { id: 'grouping', label: 'Groups', color: 'var(--ink-faint)' },
]

export const categoryColor = (c: Category) => categories.find((x) => x.id === c)!.color

/** A block's color family (docs/STYLE.md "Category fills"): fill var(--fill-<tone>), flow dots var(--flow-<tone>).
 *  Mostly the category, but the client stands apart from DNS/CDN, and SQL from the other data stores. */
export type Tone = 'client' | 'traffic' | 'compute' | 'cache' | 'async' | 'sql' | 'nosql' | 'ai'
export function toneOf(def: BlockDef): Tone | null {
  const base = def.product?.base ?? def.type
  if (base === 'client') return 'client'
  if (base === 'sql_db') return 'sql'
  const byCategory: Partial<Record<Category, Tone>> = {
    edge: 'traffic', traffic: 'traffic', compute: 'compute', cache: 'cache', async: 'async', data: 'nosql', ai: 'ai',
  }
  return byCategory[def.category] ?? null // regions and AZs have no fill
}

export function defaultParams(type: string): Record<string, ParamValue> {
  return Object.fromEntries(registry[type].params.map((p) => [p.key, p.default]))
}
