// Loads the lesson and explainer JSON files from the repo root (lessons/, explainers/, explainers/graphs/).
// Vite bundles them at build time (import.meta.glob), so the static build needs no server.
// Formats: docs/SPEC.md "Lessons" and "Explainers". content.test.ts checks every file.
import type { Design } from '../design'

export type Traffic = { rps?: number; read_ratio?: number }
export type Success = { p99_ms: number; error_pct: number; max_cost_hr: number }
export type Requirements = { requirements: string[]; traffic: Required<Traffic>; success: Success }
export type Variant = Requirements & { id: string; twist?: string }
export type StepName = 'requirements' | 'estimation' | 'api_and_data_model' | 'design' | 'load_test' | 'twist' | 'postmortem'
export type Lesson = {
  id: string
  title: string
  mode: 'full' | 'targeted'
  brief: string
  variants: Variant[]
  starter_graph: string | null // "graphs/<name>.json", in explainers/graphs/
  hints: string[]              // the ladder: a question, a direction, a near-answer
  steps: StepName[]
  explainers?: string[]        // "Stuck? Watch the explainer"
  _notes?: string              // the math behind the numbers; Claude sees it, the UI doesn't
}

// One explainer step: a caption plus ops applied to the live scene (see explainers/ops.ts).
export type AddOp = { type: string; id: string; params?: Record<string, number | string>; between?: [string, string]; position?: { x: number; y: number } }
export type ExplainerStep = {
  caption: string
  graph?: string                                         // load graphs/<name>.json (resets the sim)
  add?: AddOp[]
  remove?: string[]
  set_params?: Record<string, Record<string, number | string>> // node id -> params
  traffic?: Traffic
  highlight?: string[]                                   // this step only
  kill?: string[]
  spike?: { multiplier: number; seconds: number }
}
export type Explainer = { id: string; title: string; steps: ExplainerStep[]; lessons?: string[] }

const byId = <T extends { id: string }>(mods: Record<string, T>) =>
  Object.values(mods).sort((a, b) => a.id.localeCompare(b.id))

export const lessons: Lesson[] = byId(import.meta.glob<Lesson>('../../../lessons/*.json', { eager: true, import: 'default' }))
export const explainers: Explainer[] = byId(import.meta.glob<Explainer>('../../../explainers/*.json', { eager: true, import: 'default' }))
const graphFiles = import.meta.glob<Design>('../../../explainers/graphs/*.json', { eager: true, import: 'default' })

/** "graphs/one-server.json" -> the design in explainers/graphs/one-server.json */
export function graph(path: string): Design {
  const d = graphFiles[`../../../explainers/${path}`]
  if (!d) throw new Error(`No graph file explainers/${path}`)
  return d
}

export type Check = { label: string; ok: boolean }
/** The variant's success criteria against the sim's global metrics. */
export function checks(g: { p99Ms: number; errorPct: number; costHr: number }, s: Success): Check[] {
  return [
    { label: `p99 under ${s.p99_ms} ms`, ok: g.p99Ms <= s.p99_ms },
    { label: `errors under ${s.error_pct}%`, ok: g.errorPct <= s.error_pct },
    { label: `cost under $${s.max_cost_hr}/hr`, ok: g.costHr <= s.max_cost_hr },
  ]
}

export const STEP_GUIDE: Record<StepName, { title: string; prompt: string }> = {
  requirements: { title: 'Requirements', prompt: 'Pick a variant. Note what is unclear and the assumptions you make.' },
  estimation: { title: 'Estimation', prompt: 'Back-of-envelope: reads/s, writes/s, storage, bandwidth. Which numbers decide the design?' },
  api_and_data_model: { title: 'API + data', prompt: 'Endpoints and the data model. What is the key, and how is it read and written?' },
  design: { title: 'Design', prompt: 'Build it on the canvas. Drag blocks from the palette and connect them.' },
  load_test: { title: 'Load test', prompt: 'Run the variant’s traffic. Keep all checks green for 10 s.' },
  twist: { title: 'Twist', prompt: 'The requirements change. Adapt the design.' },
  postmortem: { title: 'Postmortem', prompt: 'What broke, why, and what would you do differently in production?' },
}
