import { describe, expect, it } from 'vitest'
import { registry } from '..'
import { presets } from '.'

// docs/SPEC.md: every numeric default in a product preset needs a source or is marked an estimate.
describe('product presets', () => {
  it.each(presets.map((p) => [p.type, p] as const))('%s: every changed number has a source or is an estimate', (_, p) => {
    const base = registry[p.product!.base]
    const covered = (key: string) => key in p.product!.sources || p.product!.estimates.includes(key)
    const changed = p.params.filter((d) => typeof d.default === 'number' && d.key !== 'replicas'
      && base.params.find((b) => b.key === d.key)?.default !== d.default).map((d) => d.key)
    if (p.cost !== 0 || !p.requestCost) changed.push('cost')
    if (p.requestCost) changed.push('requestCost')
    expect(changed.filter((k) => !covered(k))).toEqual([])
    for (const k of p.product!.estimates) expect(p.product!.notes).toContain(k)
  })

  it('presets keep their base block in the registry and have unique types', () => {
    expect(new Set(presets.map((p) => p.type)).size).toBe(presets.length)
    for (const p of presets) expect(registry[p.product!.base].product).toBeUndefined()
  })
})
