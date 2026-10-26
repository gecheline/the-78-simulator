import { useState, type ReactNode } from 'react'

/**
 * Collapsed by default. Secondary detail (assumptions, advanced controls) stays out
 * of the way until someone asks for it, instead of competing with the primary view.
 */
export function Disclosure({ label, defaultOpen = false, badge, children }: { label: string; defaultOpen?: boolean; badge?: string; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="disclosure">
      <button className="disclosure-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`caret${open ? ' open' : ''}`}>▸</span>
        {label}
        {badge && <span className="muted" style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{badge}</span>}
      </button>
      {open && <div className="disclosure-body">{children}</div>}
    </div>
  )
}
