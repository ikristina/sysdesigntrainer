// SQL DB: writes go to the single primary; reads spread evenly over primary + read replicas.
// The connection pool caps throughput at pool_size / base latency (Little's law).
// Replication lag grows while the primary is busy and recovers when it isn't.
// Primary down: writes fail fast, reads spread over the read replicas only (none = reads fail too).
// ponytail: no automatic failover; restore_node stands for "a replica was promoted".
import type { Handler } from '../types'
import { asFlow, DEFAULT_TIMEOUT_MS, latencyOf, mixOf, num, queueStep, total } from './common'

// ponytail: lag rule is an estimate: +(ρ - 0.8) s per s above ρ 0.8, recovers at 0.5 s/s.
const LAG_FROM_RHO = 0.8
const LAG_RECOVERY = 0.5

export const sql: Handler = ({ node, inbound, children, state, dt }) => {
  const p = node.params
  const replicas = num(p.read_replicas, 0)
  const baseMs = num(p.base_latency_ms, 0)
  const timeoutMs = num(p.timeout_ms, DEFAULT_TIMEOUT_MS)
  const perNode = node.killed ? 0
    : Math.min(num(p.capacity_rps, Infinity), baseMs > 0 ? num(p.pool_size, Infinity) / (baseMs / 1000) : Infinity)

  const primUp = !node.primaryDown
  const primCap = primUp ? perNode : 0
  const readsOnPrimary = primUp ? inbound.read / (replicas + 1) : 0
  const toPrimary = inbound.write + readsOnPrimary
  const toReplicas = inbound.read - readsOnPrimary
  const prim = queueStep(toPrimary, primCap, state.queue ?? 0, timeoutMs, dt)
  const repl = queueStep(toReplicas, replicas * perNode, state.replicaQueue ?? 0, timeoutMs, dt)
  const rhoP = primCap > 0 ? toPrimary / primCap : 0
  const rhoR = perNode > 0 && replicas > 0 ? toReplicas / (replicas * perNode) : 0

  const lambda = total(inbound)
  const latP = latencyOf(baseMs, rhoP, prim.waitMs, primCap)
  const latR = latencyOf(baseMs, rhoR, repl.waitMs, perNode) // each read replica has its own queue
  const lagS = replicas > 0
    ? Math.max(0, (state.lagS ?? 0) + dt * (rhoP > LAG_FROM_RHO ? rhoP - LAG_FROM_RHO : -LAG_RECOVERY))
    : 0
  const mix = mixOf(inbound, state)
  const served = prim.out + repl.out
  // Requests dropped by a side with no capacity at all (dead primary, no read replicas) fail on every retry.
  const stuck = (primCap > 0 ? 0 : prim.dropped) + (replicas * perNode > 0 ? 0 : repl.dropped)
  const out = asFlow(served, mix)
  return {
    out: children.map(() => out),
    fanout: 'all',
    state: { queue: prim.queue, replicaQueue: repl.queue, lagS, mix },
    metrics: {
      lambda, mu: primCap + perNode * replicas, rho: Math.max(rhoP, rhoR),
      queue: prim.queue + repl.queue, served, dropped: prim.dropped + repl.dropped, stuck, baseMs,
      latencyMs: lambda > 0 ? (toPrimary * latP + toReplicas * latR) / lambda : baseMs,
      lagS: replicas > 0 ? lagS : undefined,
      stale: repl.out, // read replicas apply writes asynchronously, so any replica read can be stale
      note: !primUp && !node.killed ? 'primary down' : replicas > 0 && lagS >= 0.1 ? `lag ${lagS.toFixed(1)} s` : undefined,
    },
  }
}
