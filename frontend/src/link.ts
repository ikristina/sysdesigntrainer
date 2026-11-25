// Tutor layer: keeps the backend's mirror up to date so Claude's MCP tools can read and change the app.
// Opens a WebSocket to the backend (ws://<host>:8000/ws), sends a state snapshot every second, and
// applies the commands the backend sends back (set_traffic, kill_node, ...) to the sandbox stores.
// No backend running = the socket fails and retries quietly; the sandbox works the same.
import { create } from 'zustand'
import { play, scenarioOf, selectScenario, showHint as showCompareHint, sides, useCompare } from './compare/compareStore'
import { summarize } from './compare/run'
import { toDesign } from './design'
import { healthOf } from './display'
import { usePlayer } from './explainers/player'
import { checks } from './lessons/content'
import { active, goStep, HOLD_S, setCustom, setVariant, showHint, useLesson } from './lessons/lessonStore'
import { useMode } from './mode'
import { misses, useQuiz } from './quiz/quiz'
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
    if (typeof a.rps === 'number') sim().setTraffic({ rps: a.rps })
    if (typeof a.read_ratio === 'number') sim().setTraffic({ readRatio: a.read_ratio })
    if (typeof a.hot_key === 'number') sim().setTraffic({ hotKey: a.hot_key })
    if (typeof a.payload_kb === 'number') sim().setTraffic({ payloadKb: a.payload_kb })
    if (typeof a.followers === 'number') sim().setTraffic({ followers: a.followers })
    if (typeof a.following === 'number') sim().setTraffic({ following: a.following })
  },
  spike: (a) => sim().spike(a.multiplier as number, a.seconds as number),
  kill_node: (a) => sim().setFlag('killed', a.id as string, true),
  kill_replica: (a) => sim().setReplicasDown(a.id as string, (sim().replicasDown[a.id as string] ?? 0) + ((a.count as number) ?? 1)),
  restore_replica: (a) => sim().setReplicasDown(a.id as string, (sim().replicasDown[a.id as string] ?? 0) - ((a.count as number) ?? 1)),
  restore_node: (a) => {
    sim().setFlag('killed', a.id as string, false)
    sim().setReplicasDown(a.id as string, 0)
    sim().setFlag('primaryDown', a.id as string, false)
    sim().setFlag('partitioned', a.id as string, false)
  },
  kill_primary: (a) => sim().setFlag('primaryDown', a.id as string, true),
  partition_region: (a) => sim().setFlag('partitioned', a.id as string, true),
  highlight: (a) => sim().setHighlight(a.node_ids as string[], a.message as string),
  // Lesson tools. The backend has already checked a lesson is open and the arguments are valid.
  set_requirements: (a) => {
    if (typeof a.variant_id === 'string') setVariant(a.variant_id)
    const pick = (...keys: string[]) => Object.fromEntries(keys.filter((k) => a[k] != null).map((k) => [k, a[k]]))
    const traffic = pick('rps', 'read_ratio')
    const success = pick('p99_ms', 'error_pct', 'max_cost_hr')
    const requirements = a.requirements as string[] | undefined
    if (requirements || Object.keys(traffic).length || Object.keys(success).length) setCustom({ requirements: requirements ?? undefined, traffic, success })
  },
  advance_step: () => goStep(useLesson.getState().progress.step + 1),
  give_hint: (a) => (useMode.getState().mode.kind === 'compare' ? showCompareHint : showHint)(a.level as number),
  // Compare tools.
  run_scenario: (a) => { selectScenario(a.id as string); play() },
}

// The compare view, as get_compare returns it. Rows say which side is better per metric.
function compareState() {
  if (useMode.getState().mode.kind !== 'compare') return null
  const st = useCompare.getState(), l = st.lesson, sc = scenarioOf(st)
  const [a, b] = sides.map((s) => s.getState())
  const rows = a.run.history.length > 10 ? summarize([a.run, b.run], sc) : []
  return {
    id: l?.id ?? null, title: l?.title ?? 'Two saved designs', brief: l?.brief ?? null, swap: l?.swap ?? null,
    sides: [a.label, b.label], designs: [a.run.design, b.run.design],
    scenarios: st.scenarios.map(({ id, label, about, seconds, traffic, events }) => ({ id, label, about, seconds, traffic, events })),
    scenario: sc.id, t: a.run.sim.t, running: st.running, done: a.run.sim.t >= sc.seconds - 1e-9,
    now: [a.sim.global, b.sim.global],
    table: rows.map((r) => ({ metric: r.label, a: r.values[0], b: r.values[1], better: r.winner === null ? null : 'AB'[r.winner], about: r.about })),
    questions: l?.questions ?? [], verdict: st.verdict,
    hints_shown: l?.hints.slice(0, st.hints) ?? [], hint_count: l?.hints.length ?? 0, _hints: l?.hints ?? [],
    tutor_notes: l?._notes ?? null,
  }
}

function explainerState() {
  const { explainer: e, index } = usePlayer.getState()
  return e && { id: e.id, title: e.title, index, count: e.steps.length, caption: e.steps[index].caption }
}

// The quiz question on screen, as get_quiz returns it. The answer is left out until the user picks.
function quizState() {
  const r = useQuiz.getState().run
  if (!r) return null
  if (r.i >= r.questions.length) return { topic: r.topic, done: true, right: r.right, of: r.questions.length }
  const q = r.questions[r.i]
  return {
    topic: r.topic, number: r.i + 1, of: r.questions.length, right_so_far: r.right,
    question: q.q, choices: q.choices, picked: r.picked === null ? null : q.choices[r.picked],
    ...(r.picked !== null && { answer: q.choices[q.answer], why: q.why, note: q.note ?? null }),
  }
}

// The open lesson, as get_lesson returns it. _hints (all hint texts) is for give_hint; get_lesson drops it.
function lessonState(simState: ReturnType<typeof sim>['sim']) {
  const st = useLesson.getState()
  const { lesson: l, progress: p } = st
  if (!l) return null
  const req = active(st)
  return {
    id: l.id, title: l.title, mode: l.mode, brief: l.brief, explainers: l.explainers ?? [],
    steps: l.steps, step: p.step, step_name: l.steps[p.step],
    variants: l.variants, variant_id: p.variantId, custom: p.custom, active: req,
    notes: p.notes, hints_shown: l.hints.slice(0, p.hints), hint_count: l.hints.length, _hints: l.hints,
    checks: checks(simState, req.success), held_s: Math.round(st.heldS * 10) / 10, hold_s: HOLD_S, passed: p.passed,
    tutor_notes: l._notes ?? null,
  }
}

// What Claude sees. Numbers rounded to 3 significant digits so get_metrics stays readable.
function snapshot() {
  const { nodes, edges } = useDesign.getState()
  const s = sim()
  const round = (_: string, v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Number(v.toPrecision(3)) : v)
  const metrics = Object.fromEntries(Object.entries(s.sim.metrics).map(([id, m]) =>
    [id, { ...m, mu: Number.isFinite(m.mu) ? m.mu : 'unlimited', health: healthOf(m, isDown(s.killed, id)) }]))
  return {
    design: toDesign(nodes, edges), // design and lesson unrounded: their numbers are exact settings
    mode: useMode.getState().mode, explainer: explainerState(), lesson: lessonState(s.sim), quiz: quizState(), quiz_misses: misses(),
    ...JSON.parse(JSON.stringify({
      running: s.running, t: s.sim.t,
      traffic: { rps: s.rps, readRatio: s.readRatio, hotKey: s.hotKey, payloadKb: s.payloadKb, followers: s.followers, following: s.following, spike: s.sim.t < s.spikeUntil ? s.spikeMultiplier : null },
      killed: s.killed, replicasDown: s.replicasDown, primaryDown: s.primaryDown, partitioned: s.partitioned, cutEdges: s.sim.cut,
      global: s.sim.global, nodes: metrics, compare: compareState(),
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
