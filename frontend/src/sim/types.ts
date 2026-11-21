// Simulator types. The simulator is plain TypeScript (no React): state in, state out.
import type { ParamValue } from '../blocks/types'

/** Requests per second, split into reads and writes. */
export type Flow = { read: number; write: number }

/** One block as the simulator sees it. */
export type SimNode = { id: string; type: string; params: Record<string, ParamValue>; killed: boolean }

/** Handler-private numbers that carry over between ticks (queue depth, lag, ...). */
export type NodeState = Record<string, number>

/** Global traffic controls. `multiplier` is >1 during a spike. */
export type Traffic = { rps: number; readRatio: number; multiplier: number; hotKey?: number }

export type NodeMetrics = {
  lambda: number     // arrival rate λ (rps)
  mu: number         // service rate μ (rps); Infinity = not a bottleneck
  rho: number        // utilization λ/μ
  queue: number      // requests (or messages) waiting
  served: number     // rps that left this node's own processing
  dropped: number    // rps failed here (overload, rate limit, killed)
  baseMs: number     // base latency
  latencyMs: number  // this node's own latency right now (base + queueing)
  note?: string      // short status shown on the block, e.g. "lag 2.1 s"
  lagS?: number      // SQL replication lag
  hit?: number       // cache: effective hit ratio right now (0-1)
}

/** What one tick of a handler gets. */
export type HandlerInput = {
  node: SimNode
  inbound: Flow
  children: SimNode[]               // downstream nodes, one per outgoing edge
  state: NodeState
  prevPathFail: number              // this node's end-to-end failure share last tick (clients use it for retries)
  offered: number                   // rps this node originates (only clients get a non-zero value)
  readRatio: number
  hotKey: number                    // share of requests (0-1) that go to the single hottest key
  dt: number                        // seconds
}

/**
 * How a node's downstream calls combine:
 * - 'one':   each request goes to one child (load balancer)
 * - 'all':   each request calls every child in turn (service calling DB and cache)
 * - 'async': the caller doesn't wait for children (queue, stream)
 */
export type Fanout = 'one' | 'all' | 'async'

export type HandlerOutput = {
  out: Flow[]                       // per child, same order as `children`
  fanout: Fanout
  state: NodeState
  metrics: NodeMetrics
  source?: { offered: number; retries: number } // set by clients, used for user-facing error %
}

export type Handler = (input: HandlerInput) => HandlerOutput
