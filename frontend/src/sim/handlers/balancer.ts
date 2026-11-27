// Load balancer: its own queue, then splits across the children that are alive (like a health
// check would). Reads and writes split separately, over the edges that carry them: an edge with a
// share takes that % of them, edges without one split what's left evenly (no shares = even split).
// Requests no live edge carries fail. Gateway: same, after dropping traffic above its rate limit.
import type { Handler, HandlerInput } from '../types'
import { NONE, num, total } from './common'
import { service } from './service'

/** Fraction of `kind` each child gets; all zero if no live edge carries it. */
function weights({ children, routes }: HandlerInput, kind: 'read' | 'write') {
  const ok = children.map((c, i) => !c.killed && (routes?.[i]?.carries ?? kind) === kind)
  const share = (i: number) => (ok[i] ? routes?.[i]?.share : undefined)
  const unset = ok.filter((o, i) => o && share(i) === undefined).length
  const set = ok.reduce((a, _, i) => a + (share(i) ?? 0), 0)
  const rest = unset > 0 ? Math.max(0, 100 - set) / unset : 0
  let w = ok.map((o, i) => (o ? share(i) ?? rest : 0))
  if (!w.some(Boolean)) w = ok.map((o) => (o ? 1 : 0)) // every share 0: fall back to even
  const sum = w.reduce((a, x) => a + x, 0)
  return w.map((x) => (sum > 0 ? x / sum : 0))
}

export const balancer: Handler = (input) => {
  const r = service(input)
  const flow = r.out[0] ?? NONE
  const wr = weights(input, 'read'), ww = weights(input, 'write')
  r.fanout = 'one'
  r.out = input.children.map((_, i) => ({ read: flow.read * wr[i], write: flow.write * ww[i] }))
  // Nothing live carries these (all children dead, or no edge for reads/writes): they fail, retries too.
  const lost = (wr.some(Boolean) ? 0 : flow.read) + (ww.some(Boolean) ? 0 : flow.write)
  if (input.children.length > 0 && lost > 0) {
    r.metrics.dropped += lost
    r.metrics.stuck = (r.metrics.stuck ?? 0) + lost
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
