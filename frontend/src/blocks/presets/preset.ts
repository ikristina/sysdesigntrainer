// A product preset is a generic block with product-specific defaults, params and price
// (docs/SPEC.md "Product presets"). presetBlock() turns it into a normal BlockDef, so the
// palette, the simulator and saving treat products like any other block.
import type { SimpleIcon } from 'simple-icons'
import type { BlockDef, ParamDef, ParamValue, Product } from '../types'

export type Preset = {
  id: string
  base: BlockDef
  label: string
  logo?: SimpleIcon
  badge?: string
  simBehavior?: string                 // a different handler than the base (DynamoDB, CockroachDB)
  params?: Record<string, ParamValue>  // new defaults for params (the base's or addParams)
  addParams?: ParamDef[]               // params the generic block doesn't have
  dropParams?: string[]                // params the product doesn't have (Memcached: no persistence)
} & Pick<BlockDef, 'cost' | 'costPer' | 'requestCost' | 'transferCost'> & Omit<Product, 'base' | 'logo' | 'badge'>

export function presetBlock(p: Preset): BlockDef {
  const params = [...p.base.params.filter((d) => !p.dropParams?.includes(d.key)), ...(p.addParams ?? [])]
    .map((d) => (p.params && d.key in p.params ? { ...d, default: p.params[d.key] } : d))
  return {
    ...p.base, type: p.id, label: p.label, params, simBehavior: p.simBehavior ?? p.base.simBehavior,
    cost: p.cost, costPer: p.costPer, requestCost: p.requestCost, transferCost: p.transferCost,
    product: {
      base: p.base.type, logo: p.logo && { path: p.logo.path, hex: `#${p.logo.hex}` }, badge: p.badge,
      facts: p.facts, sources: p.sources, estimates: p.estimates, notes: p.notes, memoryGb: p.memoryGb,
    },
  }
}
