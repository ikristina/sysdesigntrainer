import { describe, expect, it } from 'vitest'
import { canLink, fromDesign, toDesign, type Design } from './design'

const design: Design = {
  version: 1,
  nodes: [
    { id: 'r1', type: 'region', position: { x: 0, y: 0 }, size: { w: 500, h: 300 }, params: { name: 'eu-west-1' } },
    { id: 'api', type: 'service', position: { x: 40, y: 60 }, parentId: 'r1', params: { replicas: 4 } },
    { id: 'db', type: 'sql_db', position: { x: 300, y: 60 }, parentId: 'r1', params: {} },
  ],
  edges: [{ id: 'e1', source: 'api', target: 'db' }],
}

const trip = (d: unknown) => { const { nodes, edges } = fromDesign(d); return toDesign(nodes, edges) }

describe('save/load', () => {
  it('round-trips a design (missing params are filled with defaults)', () => {
    const back = trip(design)
    expect(back.edges).toEqual(design.edges)
    expect(back.nodes[0]).toEqual(design.nodes[0])
    expect(back.nodes[1].params).toMatchObject({ replicas: 4, capacity_rps: 1000 })
    expect(back.nodes[2]).toMatchObject({ id: 'db', parentId: 'r1', params: { read_replicas: 0 } })
    // and a second trip is stable
    expect(trip(back)).toEqual(back)
  })

  it('keeps a block label and rejects a non-text one', () => {
    const labelled = { ...design, nodes: design.nodes.map((n, i) => (i === 0 ? { ...n, label: 'writes only' } : n)) }
    expect(trip(labelled).nodes[0].label).toBe('writes only')
    expect(trip(design).nodes[0]).not.toHaveProperty('label')
    expect(() => fromDesign({ ...design, nodes: [{ ...design.nodes[0], label: 5 }] })).toThrow(/label/)
  })

  it('keeps a text note and an edge label', () => {
    const d = { ...design, nodes: [...design.nodes, { id: 'n1', type: 'note', position: { x: 0, y: 0 }, params: {}, label: 'hot key here' }],
      edges: design.edges.map((e, i) => (i === 0 ? { ...e, label: 'async' } : e)) }
    expect(fromDesign(d).nodes.at(-1)!.type).toBe('note')
    expect(trip(d).nodes.at(-1)).toEqual(d.nodes.at(-1))
    expect(trip(d).edges[0].label).toBe('async')
    expect(() => fromDesign({ ...design, edges: [{ ...design.edges[0], label: 5 }] })).toThrow(/label/)
  })

  it('keeps edge routes (carries, fanout) and rejects unknown values', () => {
    const routed = { ...design, edges: [{ id: 'e1', source: 'api', target: 'db', carries: 'write', fanout: 'write' }] }
    expect(trip(routed).edges).toEqual(routed.edges)
    expect(() => fromDesign({ ...design, edges: [{ ...design.edges[0], carries: 'both' }] })).toThrow(/carries/)
  })

  it('keeps which side an edge leaves and enters; old edges get right -> left', () => {
    const sided = { ...design, edges: [{ id: 'e1', source: 'api', target: 'db', sourceHandle: 'b', targetHandle: 't' }] }
    expect(trip(sided).edges).toEqual(sided.edges)
    expect(fromDesign(design).edges[0]).toMatchObject({ sourceHandle: 'r', targetHandle: 'l' })
    expect(() => fromDesign({ ...design, edges: [{ ...design.edges[0], targetHandle: 'middle' }] })).toThrow(/handle/)
  })

  it('canLink: no self-loops, one edge per direction between two blocks', () => {
    const { edges } = fromDesign(design)
    const c = (source: string, target: string) => ({ source, target, sourceHandle: 't', targetHandle: 'b' })
    expect(canLink(edges, c('db', 'api'))).toBe(true)
    expect(canLink(edges, c('api', 'api'))).toBe(false)
    expect(canLink(edges, c('api', 'db'))).toBe(false) // parallel edge
    expect(canLink(edges, c('api', 'db'), 'e1')).toBe(true) // moving e1 to other sides of the same blocks
  })

  it('survives JSON serialization (what export/import and localStorage do)', () => {
    const json = JSON.parse(JSON.stringify(trip(design)))
    expect(trip(json)).toEqual(json)
  })

  it('rejects bad input with a readable message', () => {
    expect(() => fromDesign({})).toThrow(/Not a design/)
    expect(() => fromDesign({ ...design, nodes: [{ ...design.nodes[0], type: 'mainframe' }] })).toThrow(/Unknown block type/)
    expect(() => fromDesign({ ...design, edges: [{ id: 'x', source: 'api', target: 'nope' }] })).toThrow(/missing node/)
  })
})
