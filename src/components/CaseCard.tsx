import { caseById } from '../data'

export function CaseCard({ id }: { id?: string }) {
  const c = id ? caseById.get(id) : undefined
  if (!c) return null
  return (
    <div className="case-card">
      <div className="section-title">Comparable case</div>
      <h4>
        {c.name} <span className="muted small">· {c.city}</span>
      </h4>
      <div className="small">{c.lesson}</div>
      <div className="row wrap small" style={{ marginTop: 6 }}>
        <a href={c.url} target="_blank" rel="noreferrer">Reference</a>
        {c.citation_status === 'needs-review' && <span className="flag">Citation needs review</span>}
      </div>
    </div>
  )
}
