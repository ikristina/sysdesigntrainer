// Explainer player: which explainer and step is showing, and pushing each step's scene into the
// sandbox stores (design, traffic, killed, highlight). The sim keeps running live underneath.
import { create } from 'zustand'
import { explainers, type Explainer } from '../lessons/content'
import { useSim } from '../simStore'
import { useDesign } from '../store'
import { applyStep, sceneAt, type Scene } from './ops'

type Player = { explainer: Explainer | null; index: number; scene: Scene | null }
export const usePlayer = create<Player>(() => ({ explainer: null, index: 0, scene: null }))

function show(e: Explainer, index: number, scene: Scene, reset: boolean) {
  const sim = useSim.getState()
  useDesign.getState().open(null, scene.design) // null = never autosave explainer graphs
  sim.setRps(scene.rps)
  sim.setReadRatio(scene.readRatio)
  useSim.setState({ killed: scene.killed, partitioned: [], down: {}, primaryDown: [] })
  sim.setHighlight(scene.highlight)
  if (reset) sim.reset()
  const spike = e.steps[index].spike
  if (spike) sim.spike(spike.multiplier, spike.seconds)
  sim.play()
  usePlayer.setState({ explainer: e, index, scene })
}

export function startExplainer(id: string) {
  const e = explainers.find((x) => x.id === id)
  if (e) show(e, 0, sceneAt(e, 0), true)
}

/** Next applies one more step on top of the live sim; any other jump replays from step 0. */
export function goStep(index: number) {
  const { explainer: e, index: cur, scene } = usePlayer.getState()
  if (!e || index < 0 || index >= e.steps.length) return
  if (index === cur + 1 && scene) {
    const next = applyStep(scene, e.steps[index])
    show(e, index, next, next.resetSim)
  } else {
    show(e, index, sceneAt(e, index), true)
  }
}

export const stopExplainer = () => usePlayer.setState({ explainer: null, index: 0, scene: null })
