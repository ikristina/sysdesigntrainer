// Which mode the app is in: sandbox, an explainer, a lesson, or compare. The URL hash holds it
// (#/explainer/<id>, #/lesson/<id>, #/compare/<lesson id>, #/compare/ for two saved designs), so reload keeps your place and the browser Back button works.
// Entering a mode clears the run (traffic, kills, highlight) and swaps in that mode's design.
import { create } from 'zustand'
import { SANDBOX_KEY } from './design'
import { startCompare, stopCompare } from './compare/compareStore'
import { startExplainer, stopExplainer } from './explainers/player'
import { compareLessons, explainers, lessons } from './lessons/content'
import { startLesson, stopLesson } from './lessons/lessonStore'
import { useSim } from './simStore'
import { useDesign } from './store'

export type Mode = { kind: 'sandbox' } | { kind: 'explainer' | 'lesson' | 'compare'; id: string } // compare id '' = two saved designs

export const hashOf = (m: Mode) => (m.kind === 'sandbox' ? '#/' : `#/${m.kind}/${m.id}`)
export function parseHash(hash: string): Mode {
  const [, kind, id] = hash.match(/^#\/(explainer|lesson|compare)\/(.*)$/) ?? []
  if (kind === 'explainer' && explainers.some((e) => e.id === id)) return { kind, id }
  if (kind === 'lesson' && lessons.some((l) => l.id === id)) return { kind, id }
  if (kind === 'compare' && (id === '' || compareLessons.some((l) => l.id === id))) return { kind, id }
  return { kind: 'sandbox' }
}

export const useMode = create<{ mode: Mode }>(() => ({ mode: { kind: 'sandbox' } }))
export const go = (m: Mode) => { location.hash = hashOf(m) } // the hashchange listener does the rest

function enter(mode: Mode) {
  const sim = useSim.getState()
  sim.pause()
  sim.reset()
  useSim.setState({ killed: [], partitioned: [], highlight: { ids: [], message: '' } })
  stopExplainer()
  stopLesson()
  stopCompare()
  if (mode.kind === 'explainer') startExplainer(mode.id)
  else if (mode.kind === 'lesson') startLesson(mode.id)
  else if (mode.kind === 'compare') startCompare(mode.id)
  else useDesign.getState().open(SANDBOX_KEY)
  useMode.setState({ mode })
}

export function startModes() {
  window.addEventListener('hashchange', () => enter(parseHash(location.hash)))
  const mode = parseHash(location.hash)
  if (mode.kind !== 'sandbox') enter(mode) // the sandbox design is already loaded
}
