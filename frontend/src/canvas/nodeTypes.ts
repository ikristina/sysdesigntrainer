// Defined once, outside any component, so React Flow doesn't see "new" types on every render.
// Shared by the main canvas and the compare view's two canvases.
import { BlockNode } from './BlockNode'
import { ContainerNode } from './ContainerNode'
import { RoughEdge } from './RoughEdge'

export const nodeTypes = { block: BlockNode, container: ContainerNode }
export const edgeTypes = { rough: RoughEdge }
