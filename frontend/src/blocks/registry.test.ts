import { describe, expect, it } from 'vitest'
import tokens from '../tokens.css?raw'
import { drawShape } from '../canvas/shapes'
import { blocks, categories, defaultParams, registry, toneOf } from '.'
import { validateParam } from './types'

describe('block registry', () => {
  it('has every block from the spec, with unique types', () => {
    expect(Object.keys(registry)).toHaveLength(blocks.length)
    for (const t of ['client', 'dns', 'cdn', 'load_balancer', 'api_gateway', 'service', 'worker', 'function',
      'sql_db', 'kv', 'wide_column', 'graph_db', 'search', 'vector_db', 'blob', 'cache', 'queue', 'stream',
      'llm', 'embedding', 'region', 'az']) {
      expect(registry[t], t).toBeDefined()
    }
  })

  it('every block is well-formed and its defaults pass its own validation', () => {
    for (const b of blocks) {
      expect(categories.map((c) => c.id), b.type).toContain(b.category)
      expect(b.cost, b.type).toBeGreaterThanOrEqual(0)
      for (const p of b.params) expect(validateParam(p, p.default), `${b.type}.${p.key}`).toBeNull()
      expect(Object.keys(defaultParams(b.type))).toEqual(b.params.map((p) => p.key))
    }
  })
})

describe('block looks (docs/STYLE.md)', () => {

  it('every block maps to a drawable shape and to fill and flow tokens that exist', () => {
    for (const b of blocks.filter((x) => x.category !== 'grouping' && x.category !== 'note')) {
      const shape = b.shape ?? 'box', tone = toneOf(b)
      expect(drawShape(shape, {}, {}).length, b.type).toBeGreaterThan(0)
      expect(tone, b.type).not.toBeNull()
      expect(tokens, b.type).toContain(`--fill-${tone}:`)
      expect(tokens, b.type).toContain(`--flow-${tone}:`)
    }
  })

  it('SQL stores are mint, the other data stores green, the client lilac', () => {
    expect([registry.postgres, registry.cockroachdb, registry.sql_db].map(toneOf)).toEqual(['sql', 'sql', 'sql'])
    expect([registry.kv, registry.dynamodb, registry.blob].map(toneOf)).toEqual(['nosql', 'nosql', 'nosql'])
    expect([registry.client, registry.cdn].map(toneOf)).toEqual(['client', 'traffic'])
  })
})

describe('validateParam', () => {
  const replicas = registry.service.params.find((p) => p.key === 'replicas')!
  const eviction = registry.cache.params.find((p) => p.key === 'eviction')!

  it('enforces min, max and whole numbers', () => {
    expect(validateParam(replicas, 3)).toBeNull()
    expect(validateParam(replicas, 0)).toMatch(/at least 1/)
    expect(validateParam(replicas, 101)).toMatch(/at most 100/)
    expect(validateParam(replicas, 1.5)).toMatch(/whole/)
    expect(validateParam(replicas, NaN)).toMatch(/number/)
  })

  it('enforces options', () => {
    expect(validateParam(eviction, 'lfu')).toBeNull()
    expect(validateParam(eviction, 'random')).toMatch(/one of/)
  })
})
