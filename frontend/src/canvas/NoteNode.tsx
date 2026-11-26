// Free text on the canvas (blocks/note.ts): just the words, no box, no connection dots.
import type { NodeProps } from '@xyflow/react'
import type { FlowNode } from '../design'

export function NoteNode({ data }: NodeProps<FlowNode>) {
  return <div className={`note-node${data.label ? '' : ' note-node--empty'}`}>{data.label || 'Text: type it in the Selected panel'}</div>
}
