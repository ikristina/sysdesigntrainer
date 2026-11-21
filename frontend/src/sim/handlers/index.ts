// Which handler runs each block. Keys are the `simBehavior` strings in the block registry.
// A new block reuses one of these; a new kind of behavior adds a handler here.
import type { Handler } from '../types'
import { balancer, gateway } from './balancer'
import { cache } from './cache'
import { client } from './client'
import { consensus } from './consensus'
import { partitioned } from './partitioned'
import { queue } from './queue'
import { service } from './service'
import { sql } from './sql'
import { stream } from './stream'

export const handlers: Record<string, Handler> = {
  client, balancer, gateway, cache, sql, queue, stream, service, partitioned, consensus,
  kv: service, passthrough: service,
}
