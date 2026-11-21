// A product's mark (docs/STYLE.md "Product logos"): its Simple Icons logo in ink, switching to the
// brand color when the tile or block is hovered or selected (CSS reads --brand), or its initials
// when Simple Icons has none (AWS services, Memcached, Valkey). Generic blocks have no mark.
import type { CSSProperties } from 'react'
import type { BlockDef } from '../blocks/types'

export function Mark({ def }: { def: BlockDef }) {
  const p = def.product
  if (p?.logo) {
    return (
      <svg className="mark" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ '--brand': p.logo.hex } as CSSProperties}>
        <path d={p.logo.path} />
      </svg>
    )
  }
  if (p?.badge) return <span className="mark mark--badge">{p.badge}</span>
  return null
}
