import { expect, it } from 'vitest'
import { useSim } from './simStore'
import { useDesign } from './store'

it('editing a block\'s replicas brings its dead replicas back; other edits keep them', () => {
  useDesign.setState({ storageKey: null }) // no localStorage in tests
  useDesign.getState().addBlock('service', { x: 0, y: 0 })
  const id = useDesign.getState().nodes.at(-1)!.id
  useDesign.getState().setParam(id, 'replicas', 3)
  useSim.getState().setReplicasDown(id, 5)
  expect(useSim.getState().replicasDown[id]).toBe(3) // clamped to the replica count
  useDesign.getState().setParam(id, 'capacity_rps', 500)
  expect(useSim.getState().replicasDown[id]).toBe(3)
  useDesign.getState().setParam(id, 'replicas', 2)
  expect(useSim.getState().replicasDown[id]).toBeUndefined()
})
