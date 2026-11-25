// Small helpers shared by the handlers.
import type { ParamValue } from '../../blocks/types'
import type { Flow, NodeState, SimNode } from '../types'
import { fmtCount } from '../../display'

// Extra latency on an edge between two regions / two AZs. Estimates: ~70 ms is a typical
// US east-west round trip; cross-AZ is about 1 ms.
export const CROSS_REGION_MS = 70
export const CROSS_AZ_MS = 1

// How long a request may wait in a node's queue before it fails, for blocks with no
// timeout_ms param (DBs, caches...). Estimate.
export const DEFAULT_TIMEOUT_MS = 1000

export const num = (v: ParamValue | undefined, fallback: number) => (typeof v === 'number' ? v : fallback)
export const total = (f: Flow) => f.read + f.write
export const NONE: Flow = { read: 0, write: 0 }

/** Service rate μ = replicas × capacity_rps. Blocks without capacity never saturate. Killed = 0. */
export const muOf = (n: SimNode) =>
  n.killed ? 0 : num(n.params.replicas, 1) * num(n.params.capacity_rps, Infinity)

/**
 * Latency of a block running at utilization ρ: base + the M/M/c wait + time spent in an overflow queue.
 * `mu` is the rate of ONE replica: a load balancer gives each replica its own queue, so replicas
 * don't share a wait line. A replica is c parallel servers, c = μ × base latency (Little's law): a
 * service doing 1,000 rps per replica at 20 ms has 20 requests in flight. Many servers barely queue
 * until they're nearly full (like a real fleet); one server (c = 1) queues early.
 * Each server takes c / μ per request (= base, up to rounding c to a whole number), so the c servers
 * add up to exactly μ. When μ × base < 1, c is 1 and that service time is 1/μ, longer than base.
 * ρ is capped at 0.99 here; at ρ ≥ 1 the overflow queue (queueStep's waitMs) takes over.
 */
export function latencyOf(baseMs: number, rho: number, waitMs: number, mu: number) {
  if (baseMs <= 0 || rho <= 0 || !Number.isFinite(mu) || mu <= 0) return baseMs + waitMs
  const c = Math.max(1, Math.round((mu * baseMs) / 1000)), serviceMs = (c / mu) * 1000, r = Math.min(rho, 0.99)
  return baseMs + erlangC(c, c * r) * serviceMs / (c * (1 - r)) + waitMs
}

/** Rate of one replica: μ / replicas. */
export const perReplica = (n: SimNode) => muOf(n) / Math.max(1, num(n.params.replicas, 1))

/** Erlang C: chance a request has to wait, for c servers and offered load a = λ × service time. */
export function erlangC(c: number, a: number) {
  // Erlang B by the stable recurrence, then convert. ponytail: past 10k servers the wait is ~0 below ρ 0.99.
  if (c > 10_000) return 0
  let b = 1
  for (let k = 1; k <= c; k++) b = (a * b) / (k + a * b)
  const rho = a / c
  return b / (1 - rho * (1 - b))
}

/**
 * One tick of a FIFO queue in front of a server with rate μ.
 * Arrivals above μ pile up; once waiting would exceed the timeout, the overflow fails.
 */
export function queueStep(lambda: number, mu: number, queue: number, timeoutMs: number, dt: number) {
  if (mu <= 0) return { queue: 0, out: 0, dropped: lambda, waitMs: 0 }
  let q = Math.max(0, queue + (lambda - mu) * dt)
  const maxQ = (mu * timeoutMs) / 1000
  let dropped = 0
  if (q > maxQ) { dropped = (q - maxQ) / dt; q = maxQ }
  return { queue: q, out: lambda - dropped - (q - queue) / dt, dropped, waitMs: (q / mu) * 1000 }
}

/**
 * Read share of what's in the queue. Uses this tick's arrivals, or last tick's when nothing
 * arrived (so a draining queue still knows its mix).
 * ponytail: one mix for the whole queue; track reads and writes separately if that ever matters.
 */
export function mixOf(inbound: Flow, state: NodeState) {
  const t = total(inbound)
  return t > 0 ? inbound.read / t : (state.mix ?? 1)
}

export const asFlow = (rate: number, mix: number): Flow => ({ read: rate * mix, write: rate * (1 - mix) })

/** Note under a queue or stream: its backlog, and messages put back for redelivery. */
export const backlogNote = (backlog: string | false, redelivered: number) =>
  [backlog, redelivered >= 1 && `↻ ${fmtCount(redelivered)}/s`].filter(Boolean).join(' · ') || undefined

/** Share of requests that fail `k` tries in a row, when `stuck` of them fail every try and the rest
 *  fail each try independently (so that `fail` of all requests fail a single try). */
export function failAll(fail: number, stuck: number, k: number) {
  const q = stuck < 1 ? Math.max(0, fail - stuck) / (1 - stuck) : 0
  return stuck + (1 - stuck) * q ** k
}
