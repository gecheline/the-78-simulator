import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { actorById, channelById, data, segmentById, stageById } from '../data'
import { runScenario, type Levers, type ScenarioInput, type ScenarioResult, type Sliders } from '../model/scenario'
import type { Decision } from '../types'
import { Drawer } from '../components/Drawer'
import { EvidenceTag } from '../components/Evidence'
import { CaseCard } from '../components/CaseCard'
import { Disclosure } from '../components/Disclosure'
import { RippleSankey, type RippleSelection } from '../components/RippleSankey'
import { MapStrip } from '../components/MapStrip'

const PRESETS = data.decisions.filter((d) => d.kind === 'decision')
const decisionById = new Map(data.decisions.map((d) => [d.id, d]))
const CHANNEL_IDS = data.channels.map((c) => c.id)
const LEVER_TARGETS = { cba: decisionById.get('cba')?.targets ?? [] }
const channelLabel = (c: string) => channelById.get(c)?.label ?? c
const fmt = (x: number) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2)
/** Each panel's "tile color" — see .card.tile in styles.css. */
const tile = (varName: string): CSSProperties => ({ '--tile-color': `var(${varName})` } as CSSProperties)

function activeDecisions(preset: string): Decision[] {
  const d = decisionById.get(preset)!
  return d.stacks_on ? [decisionById.get(d.stacks_on)!, d] : [d]
}

function makeInput(preset: string, levers: Levers, sliders: Sliders): ScenarioInput {
  return {
    decisions: activeDecisions(preset),
    levers,
    sliders,
    segments: data.segments,
    sensitivities: data.sensitivities,
    channels: CHANNEL_IDS,
    leverTargets: LEVER_TARGETS,
    ordinanceHolds: data.params.ordinance_holds,
    draws: data.params.simulation.draws,
    seed: data.params.simulation.seed,
    jitter: data.params.simulation.weight_jitter,
  }
}

type Selection = RippleSelection | null

export default function ScenarioBuilder({ openActor }: { openActor: (id: string) => void }) {
  const [preset, setPreset] = useState('baseline')
  const [levers, setLevers] = useState<Levers>({ landTrust: false, agreement: 'off' })
  const [sliders, setSliders] = useState<Sliders>(() => Object.fromEntries(data.params.sliders.map((s) => [s.id, s.value])))
  const [compareWith, setCompareWith] = useState<string>('')
  const [sel, setSel] = useState<Selection>(null)
  const [showSignal, setShowSignal] = useState(false)
  const [explore, setExplore] = useState<'ripple' | 'map'>('ripple')

  const result = useMemo(() => runScenario(makeInput(preset, levers, sliders), channelLabel), [preset, levers, sliders])
  const compare = useMemo(
    () => (compareWith ? runScenario(makeInput(compareWith, levers, sliders), channelLabel) : null),
    [compareWith, levers, sliders],
  )
  const decision = decisionById.get(preset)!

  return (
    <div className="scenario">
      <Timeline decision={decision} levers={levers} openActor={openActor} />

      <div className="card tile decisions" style={tile('--indigo')}>
        <div>
          <div className="section-title">Decision</div>
          {PRESETS.map((d) => (
            <label key={d.id} className={`preset${preset === d.id ? ' on' : ''}`}>
              <input type="radio" name="preset" checked={preset === d.id} onChange={() => { setPreset(d.id); setSel(null) }} />
              <span>
                {d.label}
                {d.evidence === 'documented' && <span className="ev ev-documented" style={{ marginLeft: 6, fontSize: 10.5 }}>Approved Jul 2026</span>}
              </span>
            </label>
          ))}
          <div className="small muted" style={{ marginTop: 4 }}>{decision.description}</div>
        </div>

        <div>
          <div className="section-title">Counter-levers</div>
          <label className="preset">
            <input type="checkbox" checked={levers.landTrust} onChange={(e) => setLevers({ ...levers, landTrust: e.target.checked })} />
            <span>Community land trust <span className="ev ev-interview" style={{ fontSize: 10.5 }}>Interview</span></span>
          </label>
          <div className="row" style={{ paddingLeft: 8, gap: 6 }}>
            <div className="seg-toggle" role="group" aria-label="Agreement">
              {(['off', 'cba', 'ordinance'] as const).map((a) => (
                <button key={a} aria-pressed={levers.agreement === a} onClick={() => setLevers({ ...levers, agreement: a })} style={{ padding: '4px 10px', fontSize: 13 }}>
                  {a === 'off' ? 'No agreement' : a === 'cba' ? 'CBA' : 'Ordinance'}
                </button>
              ))}
            </div>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            {levers.agreement === 'cba' && 'Negotiated with the developer. Related can decline, so it only takes effect in some runs.'}
            {levers.agreement === 'ordinance' && `Passed by City Council (the Woodlawn route). Assumed to hold in ${Math.round(data.params.ordinance_holds * 100)}% of runs.`}
            {levers.agreement === 'off' && levers.landTrust && 'The land trust is contested within Chinatown: legacy owners who join give up their resale gains.'}
          </div>
          {levers.agreement !== 'off' && <div style={{ marginTop: 6 }}><CaseCard id={levers.agreement === 'cba' ? 'atlantic_yards' : 'woodlawn'} /></div>}
        </div>

        <Disclosure label="Argue with the assumptions" badge={`${data.params.sliders.length} weights`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="small muted">These numbers are guesses for the room to contest, not findings. Nothing here is required reading before you run a scenario.</div>
            {data.params.sliders.map((s) => (
              <label key={s.id} className="slider" title={s.help}>
                <span>{s.label}</span>
                <span className="val">{sliders[s.id].toFixed(2)}</span>
                <input type="range" min={s.min} max={s.max} step={s.step} value={sliders[s.id]}
                  onChange={(e) => setSliders({ ...sliders, [s.id]: Number(e.target.value) })} />
              </label>
            ))}
            <button className="btn" onClick={() => setSliders(Object.fromEntries(data.params.sliders.map((s) => [s.id, s.value])))}>Reset weights</button>
          </div>
        </Disclosure>

        <Disclosure label="Compare and builder tools">
          <div>
            <div className="section-title">Compare with another scenario</div>
            <select value={compareWith} onChange={(e) => setCompareWith(e.target.value)} style={{ width: '100%', font: 'inherit', fontSize: 13, padding: 4 }}>
              <option value="">No comparison</option>
              {PRESETS.filter((d) => d.id !== preset).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>
          <div className="signal" style={{ marginTop: 10 }}>
            <button className="linkish small" onClick={() => setShowSignal(!showSignal)}>
              {showSignal ? 'Hide' : 'Show'} signal hook (builders' view)
            </button>
            {showSignal && <SignalHook decision={decision} levers={levers} />}
          </div>
        </Disclosure>
      </div>

      <div className="card tile explore" style={tile('--teal')}>
        <div className="explore-tabs" role="tablist" aria-label="Explore">
          <button role="tab" aria-pressed={explore === 'ripple'} onClick={() => setExplore('ripple')}>Why — the ripple</button>
          <button role="tab" aria-pressed={explore === 'map'} onClick={() => setExplore('map')}>Where — the map</button>
          <span className="spacer" />
          {explore === 'ripple' && (
            <span className="small row muted" style={{ gap: 10 }}>
              <span><Swatch color="var(--ink-2)" /> channel up</span>
              <span><Swatch color="var(--ink-3)" dash /> channel down</span>
              <span><Swatch color="var(--gain)" /> gain</span>
              <span><Swatch color="var(--loss)" /> loss</span>
            </span>
          )}
        </div>
        <div className="explore-view">
          {explore === 'ripple' ? (
            <>
              <RippleSankey result={result} decisions={activeDecisions(preset)} onSelect={setSel} />
              <div className="small muted">Line width = size of effect. Click any line or box to see the arithmetic behind it.</div>
            </>
          ) : (
            <MapStrip result={result} sliders={sliders} landTrust={levers.landTrust} openActor={openActor} />
          )}
        </div>
      </div>

      <WinnersLosers result={result} compare={compare} compareLabel={compareWith ? decisionById.get(compareWith)!.label : ''} onSelect={(id) => setSel({ kind: 'segment', id })} />

      {sel && <Explain sel={sel} result={result} sliders={sliders} onClose={() => setSel(null)} openActor={openActor} />}
    </div>
  )
}

function Pair({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <Fragment>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </Fragment>
  )
}

function Swatch({ color, dash }: { color: string; dash?: boolean }) {
  return (
    <svg width="18" height="8" aria-hidden style={{ verticalAlign: 'middle' }}>
      <line x1="0" x2="18" y1="4" y2="4" stroke={color} strokeWidth="5" strokeDasharray={dash ? '3 2' : undefined} />
    </svg>
  )
}

function Timeline({ decision, levers, openActor }: { decision: Decision; levers: Levers; openActor: (id: string) => void }) {
  const stage = stageById.get(decision.stage)!
  const closed = stage.status === 'passed'
  const open = data.stages.filter((s) => s.status !== 'passed')
  const venue = actorById.get(decision.venue)
  const leverVenues = [
    levers.landTrust ? { label: 'Land trust', id: 'clt' } : null,
    levers.agreement === 'cba' ? { label: 'CBA', id: 'related' } : null,
    levers.agreement === 'ordinance' ? { label: 'Ordinance', id: 'council' } : null,
  ].filter(Boolean) as { label: string; id: string }[]
  return (
    <div className="card tile timeline" style={tile('--violet')}>
      <div className="section-title">Approval pipeline · as of Oct 2026</div>
      <div className="stages">
        {data.stages.map((s) => (
          <div key={s.id} className={`stage ${s.status}${s.id === decision.stage ? ' this' : ''}`} title={s.interventions.join(' · ')}>
            {s.id === decision.stage && <span className="pin">this decision</span>}
            <div className="label">{s.label}</div>
            <div className="date">{s.date}</div>
          </div>
        ))}
      </div>
      <div className="window">
        {closed ? (
          <span className="closed">Window closed at {stage.label.toLowerCase()} ({stage.date}).</span>
        ) : (
          <span className="open">Window open now: {stage.label.toLowerCase()}.</span>
        )}
        <span>
          Approach{' '}
          {venue && <button className="linkish" onClick={() => openActor(venue.id)}>{venue.name}</button>}
          {leverVenues.map((l) => (
            <span key={l.id}> · {l.label}: <button className="linkish" onClick={() => openActor(l.id)}>{actorById.get(l.id)?.name}</button></span>
          ))}
        </span>
        <span className="muted small">
          Still open: {open.flatMap((s) => s.interventions).slice(0, 5).join(' · ')}
        </span>
      </div>
    </div>
  )
}

function WinnersLosers({ result, compare, compareLabel, onSelect }: {
  result: ScenarioResult; compare: ScenarioResult | null; compareLabel: string; onSelect: (id: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const sorted = [...result.segments].sort((a, b) => b.median - a.median)
  // The headline is who gains most and who loses most — five on each end tells
  // that story; the rest (mostly near zero) is one click away, not a wall of rows.
  const DEFAULT_COUNT = 5
  const rows = showAll || sorted.length <= DEFAULT_COUNT * 2
    ? sorted
    : [...sorted.slice(0, DEFAULT_COUNT), ...sorted.slice(-DEFAULT_COUNT)]
  const hiddenCount = sorted.length - rows.length
  const all = [...result.segments, ...(compare?.segments ?? [])]
  const lo = Math.min(0, ...all.map((s) => s.p10))
  const hi = Math.max(0, ...all.map((s) => s.p90))
  const x = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
  const bar = (s: { p10: number; p90: number; median: number }, color: string, h: number) => (
    <svg width="100%" height={h + 2} style={{ display: 'block' }} preserveAspectRatio="none">
      <line x1={`${x(0)}%`} x2={`${x(0)}%`} y1={0} y2={h + 2} stroke="var(--ink-3)" />
      <rect x={`${x(s.p10)}%`} width={`${Math.max(0.5, x(s.p90) - x(s.p10))}%`} y={1} height={h} fill={color} opacity={0.35} rx={2} />
      <rect x={`calc(${x(s.median)}% - 1.5px)`} width={3} y={0} height={h + 2} fill={color} />
    </svg>
  )
  return (
    <div className="card tile winners" style={tile('--gold')}>
      <div className="section-title">Winners and losers · median, 10th–90th percentile of {data.params.simulation.draws} runs</div>
      {compare && <div className="small muted" style={{ marginBottom: 4 }}>Thin bar: {compareLabel}</div>}
      {rows.map((s, i) => {
        const c = compare?.segments.find((x) => x.segment === s.segment)
        const color = s.median >= 0 ? 'var(--gain)' : 'var(--loss)'
        return (
          <Fragment key={s.segment}>
            {!showAll && i === DEFAULT_COUNT && hiddenCount > 0 && (
              <button className="linkish small" style={{ display: 'block', margin: '4px 0' }} onClick={() => setShowAll(true)}>
                Show {hiddenCount} more in the middle
              </button>
            )}
            <div className="wl-row" onClick={() => onSelect(s.segment)}>
              <div className="name">
                {segmentById.get(s.segment)?.label}
                <span className="num" style={{ color }}>{fmt(s.median)}</span>
              </div>
              {bar(s, color, 10)}
              {c && bar(c, 'var(--violet)', 5)}
              <div className="because">{s.because}</div>
              <div className="loss">
                Net loser in {Math.round(s.lossShare * 100)}% of runs
                {c && ` · compare: ${fmt(c.median)} (${Math.round(c.lossShare * 100)}%)`}
              </div>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

function SignalHook({ decision, levers }: { decision: Decision; levers: Levers }) {
  const event = {
    signal: decision.signal,
    triggers: {
      scenario: decision.id,
      stacks_on: decision.stacks_on,
      stage: decision.stage,
      venue_actor: decision.venue,
      levers: [levers.landTrust && 'land_trust', levers.agreement !== 'off' && levers.agreement].filter(Boolean),
    },
    received_at: '2026-10-26T09:00:00-05:00',
  }
  return (
    <>
      <div className="small muted" style={{ marginTop: 6 }}>
        The event a tracker would emit to load this scenario. Read-only. Matching is not wired up in v1.
      </div>
      <pre>{JSON.stringify(event, null, 2)}</pre>
    </>
  )
}

function Explain({ sel, result, sliders, onClose, openActor }: {
  sel: RippleSelection; result: ScenarioResult; sliders: Sliders; onClose: () => void; openActor: (id: string) => void
}) {
  if (sel.kind === 'segment') {
    const seg = segmentById.get(sel.id)!
    const r = result.segments.find((s) => s.segment === sel.id)!
    return (
      <Drawer kicker="Community segment" title={seg.label} accent="var(--gold)" onClose={onClose}>
        <div className="small"><b>{r.because}</b></div>
        <dl>
          <dt>Net effect</dt><dd>{fmt(r.total)} central · median {fmt(r.median)}</dd>
          <dt>Range</dt><dd>{fmt(r.p10)} to {fmt(r.p90)} (10th–90th percentile)</dd>
          <dt>Net loser</dt><dd>in {Math.round(r.lossShare * 100)}% of runs</dd>
          <dt>Vulnerability</dt><dd>{seg.vulnerability.toFixed(2)} × {sliders.vuln_scale.toFixed(1)} {seg.vulnerability_note && <div className="muted small">{seg.vulnerability_note}</div>}</dd>
        </dl>
        <div>
          <div className="section-title">Every term in the sum</div>
          <table className="small" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr className="muted"><td>Channel</td><td>Shift</td><td>Weight</td><td>Effect</td></tr></thead>
            <tbody>
              {r.terms.map((t) => (
                <tr key={t.channel} style={{ borderTop: '1px solid var(--line-2)' }}>
                  <td>{channelLabel(t.channel)}</td><td>{fmt(t.shift)}</td><td>{fmt(t.weight)}</td>
                  <td style={{ color: t.value >= 0 ? 'var(--gain)' : 'var(--loss)', fontWeight: 700 }}>{fmt(t.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="small muted" style={{ marginTop: 4 }}>Effect = shift × weight, and losses × (1 + vulnerability).</div>
        </div>
        <button className="btn" onClick={() => openActor(seg.actor_id)}>Open {actorById.get(seg.actor_id)?.name} in the power map</button>
        <EvidenceTag evidence={seg.evidence} source={seg.source} />
      </Drawer>
    )
  }

  if (sel.kind === 'channel') {
    const ch = channelById.get(sel.id)!
    const parts = result.byDecision.filter((b) => b.channel === sel.id)
    const knocks = result.knockOns.filter((k) => k.to === sel.id)
    return (
      <Drawer kicker="Effect channel" title={ch.label} accent="var(--teal)" onClose={onClose}>
        <div className="small">{ch.unit_note}</div>
        <dl>
          <dt>Total shift</dt><dd><b>{fmt(result.shifts[sel.id] ?? 0)}</b></dd>
          {parts.map((p) => <Pair key={p.decision} k={decisionById.get(p.decision)?.label} v={<>{fmt(p.value)}</>} />)}
          {knocks.map((k) => <Pair key={k.from} k="Knock-on" v={<>{fmt(k.value)} from {channelLabel(k.from).toLowerCase()} ({fmt(k.coefficient)} × {fmt(result.directShifts[k.from])})</>} />)}
        </dl>
        <EvidenceTag evidence={ch.evidence} source={ch.source} />
      </Drawer>
    )
  }

  if (sel.kind === 'decision') {
    const d = decisionById.get(sel.id)
    if (sel.id === 'knock' || !d) {
      return (
        <Drawer kicker="Knock-on effects" title="One step of channel-to-channel effects" accent="var(--teal)" onClose={onClose}>
          <div className="small">Three links are applied once, using the direct shifts: traffic lowers spending nearby, transit raises land value, and land value raises retail competition. A full iterative version is planned for v2.</div>
          <ul className="drivers small">
            {result.knockOns.map((k) => <li key={k.from}>{channelLabel(k.from)} → {channelLabel(k.to)}: {fmt(k.coefficient)} × {fmt(result.directShifts[k.from])} = <b>{fmt(k.value)}</b></li>)}
          </ul>
        </Drawer>
      )
    }
    return (
      <Drawer kicker="Decision" title={d.label} accent="var(--indigo)" onClose={onClose}>
        <div className="small">{d.description}</div>
        <dl>
          {Object.entries(d.channel_shifts ?? {}).filter(([, v]) => v !== 0).map(([c, v]) => <Pair key={c} k={channelLabel(c)} v={<>{fmt(v)}</>} />)}
          {d.uncertain_channels?.map((c) => <Pair key={c} k={channelLabel(c)} v={<>± drawn from −0.40 to +0.40</>} />)}
        </dl>
        <EvidenceTag evidence={d.evidence} source={d.source} />
      </Drawer>
    )
  }

  // A channel -> segment line.
  const seg = segmentById.get(sel.segment)!
  const r = result.segments.find((s) => s.segment === sel.segment)!
  const term = r.terms.find((t) => t.channel === sel.channel)!
  const sens = data.sensitivities.find((s) => s.segment === sel.segment && s.channel === sel.channel)
  const sources = [
    ...result.byDecision.filter((b) => b.channel === sel.channel).map((b) => `${decisionById.get(b.decision)?.label} (${fmt(b.value)})`),
    ...result.knockOns.filter((k) => k.to === sel.channel).map((k) => `knock-on from ${channelLabel(k.from).toLowerCase()} (${fmt(k.value)})`),
  ]
  const amplified = term.value < 0 && term.shift * term.weight < 0
  return (
    <Drawer kicker="Ripple line" title={<>{channelLabel(sel.channel)} → {seg.label}</>} accent="var(--teal)" onClose={onClose}>
      <div className="small">
        <b>Path:</b> {sources.join(' + ')} → {channelLabel(sel.channel).toLowerCase()} {fmt(term.shift)} → {seg.label.toLowerCase()}
      </div>
      <dl>
        <dt>Shift</dt><dd>{fmt(term.shift)}</dd>
        <dt>Sensitivity</dt>
        <dd>
          {fmt(term.weight)} {sens && <span className="muted">(stated {sens.symbol}, range {fmt(sens.range[0])} to {fmt(sens.range[1])})</span>}
          {sens?.driven_by === 'spillover' && <div className="muted small">Set by the spillover slider ({sliders.spillover.toFixed(2)}).</div>}
        </dd>
        <dt>Vulnerability</dt><dd>{amplified ? `loss × (1 + ${(seg.vulnerability * sliders.vuln_scale).toFixed(2)})` : 'not applied to gains'}</dd>
        <dt>Effect</dt><dd style={{ color: term.value >= 0 ? 'var(--gain)' : 'var(--loss)', fontWeight: 700 }}>{fmt(term.value)}</dd>
        {sens && <Pair k="When" v={sens.lag} />}
      </dl>
      {sens && <div className="small">{sens.explain}</div>}
      {sens && <EvidenceTag evidence={sens.evidence} source={sens.source} />}
      <CaseCard id={sens?.case_id} />
      <button className="btn" onClick={() => openActor(seg.actor_id)}>Open {actorById.get(seg.actor_id)?.name} in the power map</button>
    </Drawer>
  )
}
