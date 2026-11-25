// Lesson state: which lesson, variant and step; notes per step; hints shown; and whether the
// success checks have held for 10 s at the variant's traffic. Progress is saved per lesson in
// localStorage, and so is the lesson's design (a separate key from the sandbox design).
import { create } from 'zustand'
import { TICK_S } from '../sim/engine'
import { useSim } from '../simStore'
import { load, save } from '../storage'
import { useDesign } from '../store'
import { checks, graph, lessons, simTraffic, type Lesson, type Requirements, type StepName } from './content'

export const HOLD_S = 10 // checks must stay green this long to pass

type Custom = { requirements?: string[]; traffic?: Partial<Requirements['traffic']>; success?: Partial<Requirements['success']> }
type Progress = {
  variantId: string
  custom: Custom | null // set by Claude's set_requirements (custom) or a twist
  step: number
  notes: Partial<Record<StepName, string>>
  hints: number // how many hints are shown
  passed: string[] // variant ids (or "custom") whose checks held for HOLD_S
}
type State = { lesson: Lesson | null; progress: Progress; heldS: number }

const progressKey = (id: string) => `sysdesign.progress.${id}`
const fresh = (l: Lesson): Progress => ({ variantId: l.variants[0].id, custom: null, step: 0, notes: {}, hints: 0, passed: [] })

export const useLesson = create<State>(() => ({ lesson: null, progress: { variantId: '', custom: null, step: 0, notes: {}, hints: 0, passed: [] }, heldS: 0 }))

/** The requirements in force: the chosen variant, with any custom changes on top. */
export function active({ lesson, progress }: State): Requirements & { id: string; twist?: string } {
  const v = lesson!.variants.find((x) => x.id === progress.variantId) ?? lesson!.variants[0]
  const c = progress.custom
  return c ? {
    ...v, requirements: c.requirements ?? v.requirements,
    traffic: { ...v.traffic, ...c.traffic }, success: { ...v.success, ...c.success },
  } : v
}
const passKey = (p: Progress) => (p.custom ? 'custom' : p.variantId)

// newRequirements: the pass timer restarts, since it was measured against the old ones.
const update = (fn: (p: Progress) => Partial<Progress>, newRequirements = false) =>
  useLesson.setState((s) => ({ progress: { ...s.progress, ...fn(s.progress) }, heldS: newRequirements ? 0 : s.heldS }))

export function startLesson(id: string) {
  const lesson = lessons.find((l) => l.id === id)
  if (!lesson) return
  const progress = { ...fresh(lesson), ...load(progressKey(id), {}) }
  useLesson.setState({ lesson, progress, heldS: 0 })
  useDesign.getState().open(`sysdesign.lesson.${id}`, lesson.starter_graph ? graph(lesson.starter_graph) : undefined)
  setLessonTraffic()
}
export const stopLesson = () => useLesson.setState({ lesson: null, heldS: 0 })

/** Point the traffic controls at the active requirements. */
function setLessonTraffic() {
  const { traffic } = active(useLesson.getState())
  useSim.getState().setTraffic(simTraffic(traffic))
}
/** "▶ Run load test": the variant's traffic, from a clean sim. */
export function runLoadTest() {
  setLessonTraffic()
  useSim.getState().reset()
  useSim.getState().play()
}

export const setVariant = (variantId: string) => { update(() => ({ variantId, custom: null }), true); setLessonTraffic() }
/** Merge changed requirements over earlier ones (one level deep), then point traffic at them. */
export function setCustom(c: Custom) {
  update((p) => ({ custom: {
    requirements: c.requirements ?? p.custom?.requirements,
    traffic: { ...p.custom?.traffic, ...c.traffic }, success: { ...p.custom?.success, ...c.success },
  } }), true)
  setLessonTraffic()
}
export const goStep = (step: number) => update(() => ({ step }))
export const setNote = (step: StepName, text: string) => update((p) => ({ notes: { ...p.notes, [step]: text } }))
export const showHint = (level: number) => update((p) => ({ hints: Math.max(p.hints, level) }))

// Save progress whenever it changes.
useLesson.subscribe((s, prev) => {
  if (s.lesson && s.progress !== prev.progress) save(progressKey(s.lesson.id), s.progress)
})

// Every sim tick: are all checks green, at the required traffic? Count how long; pass at HOLD_S.
useSim.subscribe((sim, prev) => {
  const st = useLesson.getState()
  if (!st.lesson || sim.sim === prev.sim) return
  const req = active(st)
  const atTraffic = Object.entries(simTraffic(req.traffic)).every(([k, v]) => sim[k as keyof typeof sim] === v)
    && sim.sim.t >= sim.spikeUntil
  const ok = atTraffic && sim.sim.global.offered > 0 && checks(sim.sim, req.success).every((c) => c.ok)
  const heldS = ok ? st.heldS + TICK_S : 0
  const key = passKey(st.progress)
  if (heldS >= HOLD_S && !st.progress.passed.includes(key)) {
    useLesson.setState({ heldS, progress: { ...st.progress, passed: [...st.progress.passed, key] } })
  } else if (heldS !== st.heldS) {
    useLesson.setState({ heldS })
  }
})

export const isPassed = (s: State) => s.progress.passed.includes(passKey(s.progress))
