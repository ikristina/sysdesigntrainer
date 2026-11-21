// A block's little symbol: the product logo (Simple Icons), a text badge, or the generic emoji.
import { categoryColor } from '../blocks'
import type { BlockDef } from '../blocks/types'

export function Mark({ def }: { def: BlockDef }) {
  const p = def.product
  if (p?.logo) {
    return (
      <svg className="mark" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d={p.logo.path} fill={p.logo.hex} />
      </svg>
    )
  }
  if (p?.badge) return <span className="mark mark--badge">{p.badge}</span>
  return <span style={{ color: categoryColor(def.category) }}>{def.icon}</span>
}
