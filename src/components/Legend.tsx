import type { ReactNode } from 'react'
import { data } from '../data'
import type { Evidence, Level, Sector } from '../types'
import { Disclosure } from './Disclosure'
import { EVIDENCE_DASH, GROUP_COLOR, GROUP_LABEL, SECTOR_COLOR, SECTOR_LABEL, TIE_STYLE, TYPE_GROUP, type TieGroup, shapePath } from './encoding'

const SHAPES: { level: Level; label: string }[] = [
  { level: 'city', label: 'City' },
  { level: 'county', label: 'County' },
  { level: 'state', label: 'State' },
  { level: 'regional', label: 'Regional or federal' },
  { level: 'none', label: 'No jurisdiction' },
]
const RINGS: { ev: Evidence; label: string }[] = [
  { ev: 'documented', label: 'Documented' },
  { ev: 'press', label: 'Press' },
  { ev: 'interview', label: 'Interview' },
  { ev: 'synthetic', label: 'Synthetic' },
]
const GROUPS: TieGroup[] = ['decide', 'resource', 'relate']

function Swatch({ children, w = 22 }: { children: ReactNode; w?: number }) {
  return (
    <svg width={w} height={18} viewBox={`${-w / 2} -9 ${w} 18`} aria-hidden>
      {children}
    </svg>
  )
}

/**
 * Ordered so the one idea that matters most — height is computed, not placed — comes
 * first. Everything after that is reference material: present, but not the lead.
 */
export function Legend() {
  return (
    <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div><b>Height</b> = computed power score. Nobody placed these by hand: an actor rises when ties give it standing, weighted by the standing of whoever gives it.</div>

      <div>
        <b>Color = sector</b>
        {(Object.keys(SECTOR_COLOR) as Sector[]).map((s) => (
          <div key={s} className="row" style={{ gap: 6 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: SECTOR_COLOR[s], opacity: s === 'actant' ? 0.6 : 0.9 }} />
            {SECTOR_LABEL[s]}
          </div>
        ))}
      </div>

      <div>
        <b>Line color = how standing moves</b>
        <div className="small muted" style={{ margin: '2px 0 4px' }}>Thicker = stronger tie. Arrowhead shows on hover or click.</div>
        {GROUPS.map((g) => (
          <div key={g} style={{ marginTop: 3 }}>
            <div className="row" style={{ gap: 6 }}>
              <Swatch w={26}><line x1={-11} x2={11} y1={0} y2={0} stroke={GROUP_COLOR[g]} strokeWidth={3} /></Swatch>
              {GROUP_LABEL[g]}
            </div>
          </div>
        ))}
      </div>

      <Disclosure label="Shape, evidence outline and the 11 tie types">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <b>Shape = jurisdiction</b>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
              {SHAPES.map((s) => (
                <div key={s.level} className="row" style={{ gap: 4 }}>
                  <Swatch><path d={shapePath(s.level, 6)} fill="#868e96" /></Swatch>
                  {s.label}
                </div>
              ))}
            </div>
          </div>

          <div><b>Size</b> = number of ties in this layer.</div>

          <div>
            <b>Outline = evidence</b>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
              {RINGS.map((r) => (
                <div key={r.ev} className="row" style={{ gap: 4 }}>
                  <Swatch>
                    <defs>
                      <pattern id={`lh-${r.ev}`} width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                        <line x1="0" y1="0" x2="0" y2="4" stroke="#fff" strokeWidth="1.8" />
                      </pattern>
                    </defs>
                    <circle r={6.5} fill="#4A5FC1" />
                    {r.ev === 'synthetic' && <circle r={6.5} fill={`url(#lh-${r.ev})`} />}
                    <circle r={6.5} fill="none" stroke="#26202F" strokeWidth={r.ev === 'synthetic' ? 1 : 2} strokeDasharray={EVIDENCE_DASH[r.ev]} strokeLinecap="round" />
                  </Swatch>
                  {r.label}{r.ev === 'synthetic' ? ' (hatched)' : ''}
                </div>
              ))}
            </div>
          </div>

          <div>
            <b>All 11 tie types</b> · dash pattern tells them apart within a color group
            {GROUPS.map((g) => (
              <div key={g} style={{ marginTop: 6 }}>
                <div className="small muted" style={{ fontWeight: 700 }}>{GROUP_LABEL[g]}</div>
                {data.tieTypes.filter((t) => TYPE_GROUP[t.type] === g).map((t) => {
                  const st = TIE_STYLE[t.type]
                  return (
                    <div key={t.type} className="row" style={{ gap: 6 }} title={t.meaning}>
                      <Swatch w={30}><line x1={-13} x2={13} y1={0} y2={0} stroke={st.color} strokeWidth={2.2} strokeDasharray={st.dash} /></Swatch>
                      {t.label} <span className="muted">— {t.meaning.toLowerCase()}</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </Disclosure>

      <div className="muted">Hover a node to see only its direct ties. Click a node or a line for the full story.</div>
    </div>
  )
}
