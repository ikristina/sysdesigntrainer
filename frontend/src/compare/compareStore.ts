// Compare mode state: two sides (A and B), each its own design and sim run, ticked together
// through the same scenario timeline. Each side is a small store the canvas reads through
// SimContext, so the normal block components draw it. The verdict is saved per compare.
import { create, createStore } from 'zustand'
import { registry } from '../blocks'
import { loadLocal, SANDBOX_KEY, toDesign, type Design } from '../design'
import { compareLessons, graph, type CompareLesson, type Scenario } from '../lessons/content'
import { useSim, type SimView } from '../simStore'
import { startRun, swapped, tickRun, TICK_S, type Run } from './run'

export type Side = SimView & { label: string; source: Design; run: Run }

const NO_HIGHLIGHT = { ids: [], message: '' }
const sideOf = (label: string, source: Design, sc: Scenario): Side => {
  const run = startRun(source, sc)
  return { label, source, run, sim: run.sim, running: false, killed: [], partitioned: [], highlight: NO_HIGHLIGHT, nodes: run.design.nodes }
}
const EMPTY: Design = { version: 1, nodes: [], edges: [] }
export const sides = [createStore<Side>(() => ({ ...sideOf('A', EMPTY, genericScenarios()[0]) })), createStore<Side>(() => ({ ...sideOf('B', EMPTY, genericScenarios()[0]) }))] as const

type State = {
  lesson: CompareLesson | null // null = compare two saved designs
  scenarios: Scenario[]
  scenarioId: string
  running: boolean
  speed: number                // sim ticks per real tick: 1 = real time
  hints: number
  verdict: string
}
export const useCompare = create<State>(() => ({ lesson: null, scenarios: [], scenarioId: '', running: false, speed: 1, hints: 0, verdict: '' }))

export const scenarioOf = (s: State) => s.scenarios.find((x) => x.id === s.scenarioId) ?? s.scenarios[0]
const verdictKey = (s: State) => `sysdesign.verdict.${s.lesson?.id ?? 'designs'}`

// Two saved designs: steady load and a spike, at the sandbox's current traffic.
function genericScenarios(): Scenario[] {
  const { rps, readRatio, hotKey } = useSim.getState()
  const traffic = { rps, read_ratio: readRatio, hot_key: hotKey }
  return [
    { id: 'steady', label: 'Steady load', about: 'The sandbox traffic for 30 s.', seconds: 30, traffic, events: [] },
    { id: 'spike', label: 'Spike ×3', about: 'Traffic triples for 10 s at 10 s, then drops back.', seconds: 40, traffic, events: [{ at: 10, spike: { multiplier: 3, seconds: 10 } }] },
  ]
}

const label = (d: Design, node: string, letter: string) => `${letter}: ${registry[d.nodes.find((n) => n.id === node)?.type ?? '']?.label ?? '?'}`

/** Enter compare mode: a compare lesson by id, or '' for two saved designs (A = the sandbox). */
export function startCompare(id: string) {
  pause()
  const lesson = compareLessons.find((l) => l.id === id) ?? null
  const scenarios = lesson ? lesson.scenarios : genericScenarios()
  let verdict = ''
  useCompare.setState({ lesson, scenarios, scenarioId: scenarios[0].id, hints: 0 })
  try { verdict = localStorage.getItem(verdictKey(useCompare.getState())) ?? '' } catch { /* none saved */ }
  useCompare.setState({ verdict })
  if (lesson) {
    const { node, options } = lesson.swap, g = lesson.starter_graph
    const [a, b] = options.map((t, i) => swapped(graph(typeof g === 'string' ? g : g[i]), node, t))
    setSides([[label(a, node, 'A'), a], [label(b, node, 'B'), b]])
  } else {
    const f = loadLocal(SANDBOX_KEY), sandbox = f ? toDesign(f.nodes, f.edges) : EMPTY
    setSides([['A: sandbox', sandbox], ['B: sandbox (load a design)', sandbox]])
  }
}
export const stopCompare = () => { pause(); useCompare.setState({ lesson: null }) }

function setSides(list: [string, Design][]) {
  const sc = scenarioOf(useCompare.getState())
  list.forEach(([l, d], i) => sides[i].setState(sideOf(l, d, sc)))
}

/** Replace one side's design (two-designs compare: "Load B…"). */
export function loadSide(i: 0 | 1, label: string, d: Design) {
  sides[i].setState(sideOf(label, d, scenarioOf(useCompare.getState())))
  reset()
}

export function selectScenario(id: string) { useCompare.setState({ scenarioId: id }); reset() }

/** Back to t = 0 on both sides (same designs). */
export function reset() {
  pause()
  const sc = scenarioOf(useCompare.getState())
  for (const s of sides) s.setState((x) => sideOf(x.label, x.source, sc))
}

let timer: ReturnType<typeof setInterval> | undefined
export function play() {
  const sc = scenarioOf(useCompare.getState())
  if (sides[0].getState().run.sim.t >= sc.seconds - 1e-9) reset() // finished: start over
  if (!timer) timer = setInterval(tick, TICK_S * 1000)
  useCompare.setState({ running: true })
  for (const s of sides) s.setState({ running: true })
}
export function pause() {
  clearInterval(timer)
  timer = undefined
  useCompare.setState({ running: false })
  for (const s of sides) s.setState({ running: false })
}

function tick() {
  const st = useCompare.getState(), sc = scenarioOf(st), watch = st.lesson?.swap.node
  for (const s of sides) {
    let run = s.getState().run
    for (let i = 0; i < st.speed && run.sim.t < sc.seconds - 1e-9; i++) run = tickRun(run, sc, watch)
    s.setState({ run, sim: run.sim, killed: run.killed, nodes: run.design.nodes })
  }
  if (sides[0].getState().run.sim.t >= sc.seconds - 1e-9) pause()
}

export const setSpeed = (speed: number) => useCompare.setState({ speed })
export const showHint = (n: number) => useCompare.setState({ hints: n })
export function setVerdict(verdict: string) {
  useCompare.setState({ verdict })
  try { localStorage.setItem(verdictKey(useCompare.getState()), verdict) } catch { /* not saved */ }
}
