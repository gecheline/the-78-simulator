import type { Evidence } from '../types'

const LABEL: Record<Evidence, string> = {
  documented: 'Documented',
  press: 'Press',
  interview: 'Interview',
  synthetic: 'Synthetic',
}

export function EvidenceTag({ evidence, source }: { evidence: Evidence; source?: string }) {
  return (
    <span className="row wrap" style={{ gap: 8 }}>
      <span className={`ev ev-${evidence}`}>{LABEL[evidence]}</span>
      {source && <span className="small muted">{source}</span>}
    </span>
  )
}
