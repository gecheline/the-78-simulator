import type { CSSProperties, ReactNode } from 'react'

export function Drawer({ kicker, title, accent, onClose, children }: {
  kicker: string; title: ReactNode; accent?: string; onClose: () => void; children: ReactNode
}) {
  return (
    <aside className="drawer" aria-label="Details" style={accent ? ({ '--tile-color': accent } as CSSProperties) : undefined}>
      <header>
        <div>
          <div className="kicker">{kicker}</div>
          <h2>{title}</h2>
        </div>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="body">{children}</div>
    </aside>
  )
}
