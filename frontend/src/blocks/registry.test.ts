import { describe, expect, it } from 'vitest'
import { blocks, categories, defaultParams, registry } from '.'
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
