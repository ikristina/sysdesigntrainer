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

export const blocks: BlockDef[] = [
  client, dns, cdn, load_balancer, api_gateway, service, worker, fn,
  sql_db, kv, wide_column, graph_db, search, vector_db, blob,
  cache, queue, stream, llm, embedding, region, az,
]

export const registry: Record<string, BlockDef> = Object.fromEntries(blocks.map((b) => [b.type, b]))

// Palette order, headings and accent colors (colors from docs/mockups/Main.dc.html).
export const categories: { id: Category; label: string; color: string }[] = [
  { id: 'edge', label: 'Edge', color: '#2F6FDE' },
  { id: 'traffic', label: 'Traffic', color: '#7048E8' },
  { id: 'compute', label: 'Compute', color: '#1E1E1E' },
  { id: 'data', label: 'Data', color: '#2B8A3E' },
  { id: 'cache', label: 'Cache', color: '#D6336C' },
  { id: 'async', label: 'Async', color: '#E8590C' },
  { id: 'ai', label: 'AI', color: '#0C8599' },
  { id: 'grouping', label: 'Groups', color: '#8A8578' },
]

export const categoryColor = (c: Category) => categories.find((x) => x.id === c)!.color

export function defaultParams(type: string): Record<string, ParamValue> {
  return Object.fromEntries(registry[type].params.map((p) => [p.key, p.default]))
}
