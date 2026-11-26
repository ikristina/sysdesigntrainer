import { type BlockDef } from './types'

// Free text on the canvas. No handles and no sim handler, so it never carries traffic.
// Its text is the node's label (design.ts), edited in the Selected panel.
export const note: BlockDef = {
  type: 'note', label: 'Text', category: 'note', simBehavior: 'none', cost: 0, params: [],
}
