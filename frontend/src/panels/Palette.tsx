// Left panel: every block type, grouped by category. Drag a tile onto the canvas.
// Uses the browser's built-in drag-and-drop: the tile puts the block type into the drag,
// and Canvas's onDrop reads it back.
import type { DragEvent } from 'react'
import { blocks, categories } from '../blocks'
import { DRAG_MIME } from '../canvas/Canvas'
import { Mark } from '../canvas/Mark'

export function Palette() {
  const onDragStart = (e: DragEvent, type: string) => {
    e.dataTransfer.setData(DRAG_MIME, type)
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <aside className="palette" aria-label="Blocks">
      {categories.map((c) => (
        <div key={c.id} className="palette__group">
          <div className="caps">{c.label}</div>
          {/* Generic blocks first, then products (presets of them). */}
          {[false, true].map((product) => (
            <div key={String(product)} className={`palette__items${product ? ' palette__items--products' : ''}`}>
              {blocks.filter((b) => b.category === c.id && !!b.product === product).map((b) => (
                <div
                  key={b.type}
                  className={`tile sk${product ? ' tile--product' : ''}`}
                  style={{ boxShadow: `2px 2px 0 ${c.color}` }}
                  title={b.product ? `${b.label}: a preset of ${b.product.base}` : undefined}
                  draggable
                  onDragStart={(e) => onDragStart(e, b.type)}
                >
                  <Mark def={b} /> {b.label}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </aside>
  )
}
