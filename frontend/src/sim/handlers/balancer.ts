// Load balancer: its own queue, then splits evenly across the children that are alive
// (like a health check would). Gateway: same, after dropping traffic above its rate limit.
import type { Handler } from '../types'
import { NONE, num, total } from './common'
import { service } from './service'

export const balancer: Handler = (input) => {
  const r = service(input)
  const alive = input.children.filter((c) => !c.killed).length
  const flow = r.out[0] ?? NONE
  r.fanout = 'one'
  r.out = input.children.map((c) => (c.killed ? NONE : { read: flow.read / alive, write: flow.write / alive }))
  // Children exist but all are dead: everything it served fails.
  if (input.children.length > 0 && alive === 0) {
    r.metrics.dropped += r.metrics.served
    r.metrics.stuck = r.metrics.served
  }
  return r
}

export const gateway: Handler = (input) => {
  const lambda = total(input.inbound)
  const limit = num(input.node.params.rate_limit_rps, Infinity)
  const keep = lambda > limit ? limit / lambda : 1
  const r = balancer({ ...input, inbound: { read: input.inbound.read * keep, write: input.inbound.write * keep } })
  if (keep < 1) {
    r.metrics.dropped += lambda - limit
    r.metrics.lambda = lambda
    r.metrics.note = 'rate limited'
  }
  return r
}
