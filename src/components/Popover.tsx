import type { ReactNode } from 'react'

/**
 * A button that reveals a panel on demand instead of permanently occupying layout
 * space. Keeps the primary view (the graph) at full width; reference material
 * (legend, filters) is one click away rather than always competing for attention.
 */
export function Popover({ label, open, onToggle, align = 'left', width = 320, children }: {
  label: string
  open: boolean
  onToggle: () => void
  align?: 'left' | 'right'
  width?: number
  children: ReactNode
}) {
  return (
    <div className="popover-anchor">
      <button className={`btn${open ? ' primary' : ''}`} onClick={onToggle} aria-expanded={open}>
        {label} <span style={{ opacity: 0.6 }}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className={`popover popover-${align}`} style={{ width }} onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  )
}
