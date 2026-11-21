// Tutor layer: keeps the backend's mirror up to date so Claude's MCP tools can read and change the app.
// Opens a WebSocket to the backend (ws://<host>:8000/ws), sends a state snapshot every second, and
// applies the commands the backend sends back (set_traffic, kill_node, ...) to the sandbox stores.
// No backend running = the socket fails and retries quietly; the sandbox works the same.
import { create } from 'zustand'
import { toDesign } from './design'
import { healthOf } from './display'
import { isDown, useSim } from './simStore'
import { useDesign } from './store'

export const BACKEND_WS = `ws://${location.hostname}:8000/ws`
const SEND_EVERY_MS = 1000
const RETRY_MS = 3000

export const TTYD_URL = `http://${location.hostname}:7681`
/** Is ttyd running? A no-cors fetch can't read the page, but it only fails if nothing answers. */
export const ttydUp = () => fetch(TTYD_URL, { mode: 'no-cors' }).then(() => true, () => false)

export const useLink = create(() => ({ connected: false }))

type Args = Record<string, unknown>
const sim = () => useSim.getState()
const commands: Record<string, (a: Args) => void> = {
  run: (a) => (a.on ? sim().play() : sim().pause()),
  set_traffic: (a) => {
    if (typeof a.rps === 'number') sim().setRps(a.rps)
    if (typeof a.read_ratio === 'number') sim().setReadRatio(a.read_ratio)
  },
  spike: (a) => sim().spike(a.multiplier as number, a.seconds as number),
  kill_node: (a) => sim().setFlag('killed', a.id as string, true),
  restore_node: (a) => {
    sim().setFlag('killed', a.id as string, false)
    sim().setFlag('partitioned', a.id as string, false)
  },
  partition_region: (a) => sim().setFlag('partitioned', a.id as string, true),
  highlight: (a) => sim().setHighlight(a.node_ids as string[], a.message as string),
}

// What Claude sees. Numbers rounded to 3 significant digits so get_metrics stays readable.
function snapshot() {
  const { nodes, edges } = useDesign.getState()
  const s = sim()
  const round = (_: string, v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(3)) : v)
  const metrics = Object.fromEntries(Object.entries(s.sim.metrics).map(([id, m]) =>
    [id, { ...m, mu: Number.isFinite(m.mu) ? m.mu : 'unlimited', health: healthOf(m, isDown(s.killed, id)) }]))
  return {
    design: toDesign(nodes, edges),
    ...JSON.parse(JSON.stringify({
      running: s.running, t: s.sim.t,
      traffic: { rps: s.rps, readRatio: s.readRatio, spike: s.sim.t < s.spikeUntil ? s.spikeMultiplier : null },
      killed: s.killed, partitioned: s.partitioned, cutEdges: s.sim.cut,
      global: s.sim.global, nodes: metrics,
    }, round)),
  }
}

export function startLink() {
  const ws = new WebSocket(BACKEND_WS)
  let timer: ReturnType<typeof setInterval> | undefined
  const send = () => ws.send(JSON.stringify({ type: 'state', state: snapshot() }))
  ws.onopen = () => {
    useLink.setState({ connected: true })
    send()
    timer = setInterval(send, SEND_EVERY_MS)
  }
  ws.onmessage = (e) => {
    const { op, args } = JSON.parse(e.data)
    commands[op]?.(args ?? {})
    send() // so a get_* right after a command sees it
  }
  ws.onclose = () => {
    clearInterval(timer)
    useLink.setState({ connected: false })
    setTimeout(startLink, RETRY_MS)
  }
}
