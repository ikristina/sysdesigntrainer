// Small helpers shared by the handlers.
import type { ParamValue } from '../../blocks/types'
import type { Flow, NodeState, SimNode } from '../types'

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

/** M/M/1-style latency: base / (1 - ρ), with ρ capped at 0.99, plus time spent queued. */
export const latencyOf = (baseMs: number, rho: number, waitMs: number) =>
  baseMs / (1 - Math.min(rho, 0.99)) + waitMs

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
