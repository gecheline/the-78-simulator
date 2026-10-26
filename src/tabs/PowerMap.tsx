import { forceCollide, forceLink, forceSimulation, forceX, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force'
import { easeCubicInOut } from 'd3-ease'
import { useEffect, useMemo, useRef, useState } from 'react'
import { actorById, data } from '../data'
import { computePower, inLayer, leverageHints, type PowerResult } from '../model/power'
import type { Actor, Evidence, Layer, Level, Sector, Tie, TieType } from '../types'
import { Drawer } from '../components/Drawer'
import { EvidenceTag } from '../components/Evidence'
import { EVIDENCE_DASH, GROUP_COLOR, LEVEL_LABEL, SECTOR_COLOR, SECTOR_LABEL, TIE_STYLE, TYPE_GROUP, shapePath } from '../components/encoding'
import { Legend } from '../components/Legend'
import { Popover } from '../components/Popover'
import { useSize } from '../components/useSize'

/** Labels compete for attention; cap how many show by default (Miller's-law-sized chunk). */
const DEFAULT_LABEL_COUNT = 14

const SECTORS: Sector[] = ['governance', 'private', 'public', 'actant']
const LEVELS: Level[] = ['city', 'county', 'state', 'regional', 'federal', 'none']
const EVIDENCES: Evidence[] = ['documented', 'press', 'interview', 'synthetic']
const STANCE_LABEL: Record<string, string> = {
  supports: 'Supports', conditions: 'Supports, with conditions', objects: 'Objects', pause: 'Asks for a pause',
  concerns: 'Concerns', unknown: 'Unknown', neutral: 'Neutral', proposed: 'Proposed', mixed: 'Mixed', none: '—',
}
const CHINATOWN = 'chinatown'

interface DrawnEdge {
  key: string
  from: string
  to: string
  type: string
  strength: number
  ties: Tie[]
}

interface Graph {
  nodes: Actor[]
  /** ties with endpoints remapped to visible nodes, for scoring */
  ties: Tie[]
}

type Pos = Map<string, { x: number; y: number }>
type Selection = { kind: 'node'; id: string } | { kind: 'edge'; key: string } | null

const shortName = (a: Actor) => {
  const n = a.name.replace(/\s*\(.*\)$/, '').replace(/,.*$/, '')
  return n.length > 26 ? n.slice(0, 25) + '…' : n
}
const radiusFor = (degree: number) => 7 + 2.1 * Math.sqrt(degree)
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261)

function buildGraph(expanded: boolean, sectors: Set<Sector>, levels: Set<Level>, evidence: Set<Evidence>): Graph {
  const rep = (id: string) => (!expanded && actorById.get(id)?.parent === CHINATOWN ? CHINATOWN : id)
  const nodes = data.actors.filter((a) => {
    if (!expanded && a.parent === CHINATOWN) return false
    return sectors.has(a.sector) && levels.has(a.level) && evidence.has(a.evidence)
  })
  const visible = new Set(nodes.map((n) => n.id))
  const ties = data.ties
    .filter((t) => evidence.has(t.evidence))
    .map((t) => ({ ...t, from: rep(t.from), to: rep(t.to) }))
    .filter((t) => t.from !== t.to && visible.has(t.from) && visible.has(t.to))
  return { nodes, ties }
}

function drawnEdges(ties: Tie[], layer: Layer, money: boolean): DrawnEdge[] {
  const byKey = new Map<string, DrawnEdge>()
  for (const t of ties) {
    if (money ? !t.flows.includes('money') : !inLayer(t, layer)) continue
    const key = `${t.from}|${t.to}|${t.type}`
    const e = byKey.get(key)
    if (e) {
      e.strength = Math.max(e.strength, t.strength)
      e.ties.push(t)
    } else byKey.set(key, { key, from: t.from, to: t.to, type: t.type, strength: t.strength, ties: [t] })
  }
  return [...byKey.values()]
}

interface SimNode extends SimulationNodeDatum {
  id: string
  r: number
}

type LabelMode = 'right' | 'above' | 'below'
interface Layout {
  pos: Pos
  label: Map<string, LabelMode>
}

const CHAR_W = 6.3
const labelWidth = (a: Actor) => shortName(a).length * CHAR_W

function layout(nodes: Actor[], edges: DrawnEdge[], power: PowerResult, radius: Map<string, number>, size: { w: number; h: number }, prev: Pos): Layout {
  const { w, h } = size
  const top = 36
  const bottom = 30
  const left = 64
  const right = 24
  const yOf = (s: number) => top + (1 - s) * (h - top - bottom)
  // Each sector pulls toward its own column, so sectors read left to right.
  const sectorX = (sec: Sector) => left + ((SECTORS.indexOf(sec) + 0.5) / SECTORS.length) * (w - left - right)
  const simNodes: SimNode[] = nodes.map((n) => {
    const p = prev.get(n.id)
    const seedX = sectorX(n.sector) + ((hash(n.id) % 1000) / 1000 - 0.5) * 80
    return { id: n.id, r: radius.get(n.id) ?? 8, x: p?.x ?? seedX, y: yOf(power.score.get(n.id) ?? 0), fy: yOf(power.score.get(n.id) ?? 0) }
  })
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const ids = new Set(simNodes.map((n) => n.id))
  const links: SimulationLinkDatum<SimNode>[] = edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({ source: e.from, target: e.to }))
  const sim = forceSimulation(simNodes)
    .force('x', forceX<SimNode>((d) => sectorX(byId.get(d.id)!.sector)).strength(0.08))
    .force('collide', forceCollide<SimNode>((d) => d.r + 16).strength(0.8))
    .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.id).strength(0.03).distance(110))
    .stop()
  for (let i = 0; i < 300; i++) sim.tick()

  // Height is fixed by the score. Only x moves: nodes at nearly the same height are
  // packed left to right so their labels don't collide.
  const label = new Map<string, LabelMode>()
  const sorted = [...simNodes].sort((a, b) => (a.fy ?? 0) - (b.fy ?? 0))
  const bands: SimNode[][] = []
  for (const n of sorted) {
    const band = bands[bands.length - 1]
    if (band && (n.fy ?? 0) - (band[band.length - 1].fy ?? 0) < 15) band.push(n)
    else bands.push([n])
  }
  const avail = w - left - right
  for (const band of bands) {
    band.sort((a, b) => (a.x ?? 0) - (b.x ?? 0))
    const span = (n: SimNode) => n.r * 2 + labelWidth(byId.get(n.id)!) + 12
    const total = band.reduce((s, n) => s + span(n), 0)
    if (total <= avail) {
      let cursor = left
      for (const n of band) {
        n.x = Math.max(n.x ?? 0, cursor + n.r)
        cursor = n.x + n.r + labelWidth(byId.get(n.id)!) + 12
        label.set(n.id, 'right')
      }
      const overflow = cursor - (w - right)
      if (overflow > 0) {
        // Shift back from the right, keeping order and spacing.
        let limit = w - right
        for (let i = band.length - 1; i >= 0; i--) {
          const n = band[i]
          const maxX = limit - labelWidth(byId.get(n.id)!) - 12 - n.r
          n.x = Math.min(n.x!, maxX)
          limit = n.x - n.r
        }
      }
    } else {
      // Too crowded for side labels: spread evenly, alternate labels above and below.
      const step = avail / band.length
      band.forEach((n, i) => {
        n.x = left + step * (i + 0.5)
        label.set(n.id, i % 2 ? 'below' : 'above')
      })
    }
  }
  return { pos: new Map(simNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.fy ?? 0 }])), label }
}

/** Tweens node positions so the layer toggle animates heights. */
function useAnimated(target: Pos, ms = 800): Pos {
  const [pos, setPos] = useState<Pos>(target)
  const from = useRef<Pos>(target)
  useEffect(() => {
    const start = performance.now()
    const src = from.current
    let raf = 0
    const step = (now: number) => {
      const t = easeCubicInOut(Math.min(1, (now - start) / ms))
      const next: Pos = new Map()
      for (const [id, p] of target) {
        const s = src.get(id) ?? p
        next.set(id, { x: s.x + (p.x - s.x) * t, y: s.y + (p.y - s.y) * t })
      }
      from.current = next
      setPos(next)
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return pos
}

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }, rTarget: number) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  // Bend every edge to its right, so reciprocal ties separate.
  const bend = Math.min(40, len * 0.15)
  const cx = (a.x + b.x) / 2 - (dy / len) * bend
  const cy = (a.y + b.y) / 2 + (dx / len) * bend
  // Pull the end back to the node's edge so the arrowhead shows.
  const ex = b.x - ((b.x - cx) / Math.hypot(b.x - cx, b.y - cy)) * (rTarget + 3)
  const ey = b.y - ((b.y - cy) / Math.hypot(b.x - cx, b.y - cy)) * (rTarget + 3)
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${ex} ${ey}`
}

export default function PowerMap({ focus }: { focus: { id: string; nonce: number } | null }) {
  const [layer, setLayer] = useState<Layer>('formal')
  const [expanded, setExpanded] = useState(false)
  const [money, setMoney] = useState(false)
  const [sectors, setSectors] = useState(new Set(SECTORS))
  const [levels, setLevels] = useState(new Set(LEVELS))
  const [evidence, setEvidence] = useState(new Set(EVIDENCES))
  const [tieTypes, setTieTypes] = useState<TieType[]>(data.tieTypes)
  const [hover, setHover] = useState<string | null>(null)
  const [sel, setSel] = useState<Selection>(null)
  const [showAssumptions, setShowAssumptions] = useState(false)
  const [showAllLabels, setShowAllLabels] = useState(false)
  const [openPopover, setOpenPopover] = useState<'legend' | 'refine' | null>(null)
  const [ref, size] = useSize<HTMLDivElement>()

  useEffect(() => {
    if (!focus) return
    const a = actorById.get(focus.id)
    if (a?.parent === CHINATOWN) setExpanded(true)
    setSel({ kind: 'node', id: focus.id })
  }, [focus])

  const typeMap = useMemo(() => new Map(tieTypes.map((t) => [t.type, t])), [tieTypes])
  const graph = useMemo(() => buildGraph(expanded, sectors, levels, evidence), [expanded, sectors, levels, evidence])
  const nodeIds = useMemo(() => graph.nodes.map((n) => n.id), [graph])
  const power = useMemo(
    () => ({
      formal: computePower(nodeIds, graph.ties, typeMap, 'formal', data.params.power),
      real: computePower(nodeIds, graph.ties, typeMap, 'real', data.params.power),
    }),
    [nodeIds, graph, typeMap],
  )
  const current = power[layer]
  // Default view labels only the most powerful nodes — recognizable at a glance.
  // Everyone else is still there, still clickable, named on hover or "Show all names".
  const topLabeled = useMemo(
    () => new Set([...current.score.entries()].sort((a, b) => b[1] - a[1]).slice(0, DEFAULT_LABEL_COUNT).map(([id]) => id)),
    [current],
  )
  const edges = useMemo(() => drawnEdges(graph.ties, layer, money), [graph, layer, money])
  const radius = useMemo(() => {
    const deg = new Map<string, number>()
    for (const e of drawnEdges(graph.ties, layer, false)) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1)
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1)
    }
    return new Map(graph.nodes.map((n) => [n.id, radiusFor(deg.get(n.id) ?? 0)]))
  }, [graph, layer])

  const prevTarget = useRef<Pos>(new Map())
  const target = useMemo(() => {
    const l = layout(graph.nodes, drawnEdges(graph.ties, layer, false), current, radius, size, prevTarget.current)
    prevTarget.current = l.pos
    return l
  }, [graph, layer, current, radius, size])
  const pos = useAnimated(target.pos)

  // Focus sets: hover shows direct ties, a selected edge shows its 2-step ripple.
  const selectedEdge = sel?.kind === 'edge' ? edges.find((e) => e.key === sel.key) : undefined
  const ripple = useMemo(() => {
    if (!selectedEdge) return null
    const nodes = new Set([selectedEdge.from, selectedEdge.to])
    const path = new Set([selectedEdge.key])
    const steps: { id: string; step: number; via: string }[] = []
    let frontier = [selectedEdge.to]
    for (let step = 1; step <= 2; step++) {
      const next: string[] = []
      for (const u of frontier)
        for (const e of edges)
          if (e.from === u && !nodes.has(e.to)) {
            nodes.add(e.to)
            path.add(e.key)
            next.push(e.to)
            steps.push({ id: e.to, step, via: e.type })
          }
      frontier = next
    }
    return { nodes, path, steps }
  }, [selectedEdge, edges])

  const neighborhood = useMemo(() => {
    if (!hover) return null
    const n = new Set([hover])
    const es = new Set<string>()
    for (const e of edges)
      if (e.from === hover || e.to === hover) {
        n.add(e.from)
        n.add(e.to)
        es.add(e.key)
      }
    return { nodes: n, edges: es }
  }, [hover, edges])

  const moneyNodes = useMemo(() => (money ? new Set(edges.flatMap((e) => [e.from, e.to])) : null), [money, edges])

  const nodeDim = (id: string) =>
    (neighborhood && !neighborhood.nodes.has(id)) || (!neighborhood && ripple && !ripple.nodes.has(id)) || (moneyNodes && !moneyNodes.has(id))
  const edgeDim = (key: string) => (neighborhood && !neighborhood.edges.has(key)) || (!neighborhood && ripple && !ripple.path.has(key))
  const edgeHighlighted = (key: string) => Boolean(ripple?.path.has(key)) || Boolean(neighborhood?.edges.has(key))

  const colors = Object.values(GROUP_COLOR)
  const axisTop = 36
  const axisBottom = size.h - 30

  return (
    <div className="power">
      <div className="power-controls">
        <div className="seg-toggle" role="group" aria-label="Layer">
          <button aria-pressed={layer === 'formal'} onClick={() => setLayer('formal')}>Formal power</button>
          <button aria-pressed={layer === 'real'} onClick={() => setLayer('real')}>Real influence</button>
        </div>
        <label className="chip">
          <input type="checkbox" checked={money} onChange={(e) => setMoney(e.target.checked)} /> Follow the money
        </label>
        <label className="chip">
          <input type="checkbox" checked={expanded} onChange={(e) => setExpanded(e.target.checked)} /> Expand Chinatown
        </label>
        <span className="spacer" />
        <Popover label="Legend" open={openPopover === 'legend'} onToggle={() => setOpenPopover((p) => (p === 'legend' ? null : 'legend'))} align="right" width={340}>
          <Legend />
        </Popover>
        <Popover label="Refine" open={openPopover === 'refine'} onToggle={() => setOpenPopover((p) => (p === 'refine' ? null : 'refine'))} align="right" width={300}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div className="section-title" style={{ marginBottom: 2 }}>Scoring</div>
              <div className="small muted" title="Krackhardt hierarchy index: 0 = flat, 1 = strict top-down hierarchy">
                Hierarchy index: formal <b>{power.formal.hierarchy.toFixed(2)}</b> · real <b>{power.real.hierarchy.toFixed(2)}</b>
              </div>
              <div className="small muted">
                Katz α = {current.alphaUsed.toFixed(3)}{current.alphaUsed < data.params.power.alpha ? ' (capped)' : ''}
              </div>
              <button className="btn" style={{ marginTop: 6 }} onClick={() => { setShowAssumptions(true); setOpenPopover(null) }}>
                Power assumptions…
              </button>
            </div>
            <Filters
              sectors={sectors} setSectors={setSectors}
              levels={levels} setLevels={setLevels}
              evidence={evidence} setEvidence={setEvidence}
            />
          </div>
        </Popover>
      </div>

      <div className="graph-wrap" ref={ref} onClick={() => setOpenPopover(null)}>
        <svg viewBox={`0 0 ${size.w} ${size.h}`} onClick={() => setSel(null)} role="img" aria-label="Actor network, height is power score">
          <defs>
            <pattern id="hatch" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="5" height="5" fill="transparent" />
              <line x1="0" y1="0" x2="0" y2="5" stroke="#fff" strokeWidth="2.2" opacity="0.8" />
            </pattern>
            {colors.map((c) => (
              <marker key={c} id={`arrow-${c.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={c} />
              </marker>
            ))}
          </defs>

          <g className="axis">
            <line x1={40} x2={40} y1={axisTop} y2={axisBottom} />
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = axisTop + (1 - t) * (axisBottom - axisTop)
              return (
                <g key={t}>
                  <line x1={36} x2={size.w - 20} y1={y} y2={y} stroke="var(--line-2)" />
                  <text x={32} y={y + 4} textAnchor="end">{t.toFixed(2)}</text>
                </g>
              )
            })}
            <text x={48} y={axisTop - 14} style={{ fontWeight: 700 }}>
              ↑ More {layer === 'formal' ? 'formal power' : 'real influence'} (computed power score, not placed by hand)
            </text>
          </g>

          <g>
            {edges.map((e) => {
              const a = pos.get(e.from)
              const b = pos.get(e.to)
              if (!a || !b) return null
              const dash = TIE_STYLE[e.type]?.dash
              const color = GROUP_COLOR[TYPE_GROUP[e.type]] ?? '#999'
              const d = edgePath(a, b, radius.get(e.to) ?? 8)
              const highlighted = edgeHighlighted(e.key)
              return (
                <g key={e.key} className={edgeDim(e.key) ? 'dim' : undefined}>
                  <path
                    className="edge" d={d} stroke={color} strokeDasharray={dash}
                    strokeWidth={0.6 + e.strength * 0.6 + (highlighted ? 1.6 : 0)} strokeOpacity={highlighted ? 1 : 0.32}
                    markerEnd={highlighted ? `url(#arrow-${color.slice(1)})` : undefined}
                  />
                  <path
                    className="edge-hit" d={d}
                    onClick={(ev) => { ev.stopPropagation(); setSel({ kind: 'edge', key: e.key }) }}
                  >
                    <title>{`${actorById.get(e.from)?.name} → ${typeMap.get(e.type)?.label.toLowerCase()} → ${actorById.get(e.to)?.name}`}</title>
                  </path>
                </g>
              )
            })}
          </g>

          <g>
            {graph.nodes.map((n) => {
              const p = pos.get(n.id)
              if (!p) return null
              const r = radius.get(n.id) ?? 8
              const d = shapePath(n.level, r)
              const isSel = sel?.kind === 'node' && sel.id === n.id
              return (
                <g
                  key={n.id} className={`node${nodeDim(n.id) ? ' dim' : ''}`} transform={`translate(${p.x},${p.y})`}
                  onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                  onClick={(ev) => { ev.stopPropagation(); setSel({ kind: 'node', id: n.id }) }}
                >
                  {isSel && <path d={shapePath(n.level, r + 5)} fill="none" stroke="var(--accent)" strokeWidth={3} />}
                  <path d={d} fill={SECTOR_COLOR[n.sector]} fillOpacity={n.sector === 'actant' ? 0.55 : 0.88} />
                  {n.evidence === 'synthetic' && <path d={d} fill="url(#hatch)" />}
                  <path
                    d={d} fill="none" stroke="#26202F" strokeWidth={n.evidence === 'synthetic' ? 1 : 2}
                    strokeDasharray={EVIDENCE_DASH[n.evidence]} strokeLinecap="round"
                  />
                  {n.id === CHINATOWN && !expanded && (
                    <text x={0} y={4} textAnchor="middle" style={{ fontWeight: 800, fill: '#fff', stroke: 'none' }}>+</text>
                  )}
                  {(showAllLabels || topLabeled.has(n.id) || hover === n.id || isSel) && (() => {
                    const mode = target.label.get(n.id) ?? 'right'
                    if (mode === 'right') return <text x={r + 4} y={4}>{shortName(n)}</text>
                    return <text x={0} y={mode === 'above' ? -r - 5 : r + 13} textAnchor="middle">{shortName(n)}</text>
                  })()}
                  <title>{`${n.name} · score ${(current.score.get(n.id) ?? 0).toFixed(2)}`}</title>
                </g>
              )
            })}
          </g>
        </svg>

        {showAssumptions && <Assumptions tieTypes={tieTypes} setTieTypes={setTieTypes} onClose={() => setShowAssumptions(false)} />}

        {sel?.kind === 'node' && actorById.get(sel.id) && (
          <NodePanel
            actor={actorById.get(sel.id)!} power={power} layer={layer} graph={graph} typeMap={typeMap}
            expanded={expanded} setExpanded={setExpanded} onClose={() => setSel(null)}
            onSelect={(id) => setSel({ kind: 'node', id })}
          />
        )}
        {selectedEdge && ripple && (
          <EdgePanel edge={selectedEdge} ripple={ripple.steps} typeMap={typeMap} onClose={() => setSel(null)} onSelect={(id) => setSel({ kind: 'node', id })} />
        )}

        <button className="btn show-names-toggle" onClick={(e) => { e.stopPropagation(); setShowAllLabels((s) => !s) }}>
          {showAllLabels ? 'Show fewer names' : `Show all ${graph.nodes.length} names`}
        </button>
      </div>
    </div>
  )
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set)
  if (next.has(v)) next.delete(v)
  else next.add(v)
  return next
}

function Filters(props: {
  sectors: Set<Sector>; setSectors: (s: Set<Sector>) => void
  levels: Set<Level>; setLevels: (s: Set<Level>) => void
  evidence: Set<Evidence>; setEvidence: (s: Set<Evidence>) => void
}) {
  const { sectors, setSectors, levels, setLevels, evidence, setEvidence } = props
  const documentedOnly = !evidence.has('synthetic') && !evidence.has('interview')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="section-title" style={{ marginBottom: 0 }}>Filters</div>
      <div className="chips row wrap" style={{ gap: 4 }}>
        {SECTORS.map((s) => (
          <label key={s} className={`chip${sectors.has(s) ? '' : ' off'}`}>
            <input type="checkbox" checked={sectors.has(s)} onChange={() => setSectors(toggle(sectors, s))} />
            <span style={{ width: 9, height: 9, borderRadius: 2, background: SECTOR_COLOR[s] }} />
            {SECTOR_LABEL[s].split(' (')[0].replace(' and development partners', '')}
          </label>
        ))}
      </div>
      <div className="chips row wrap" style={{ gap: 4 }}>
        {LEVELS.map((l) => (
          <label key={l} className={`chip${levels.has(l) ? '' : ' off'}`}>
            <input type="checkbox" checked={levels.has(l)} onChange={() => setLevels(toggle(levels, l))} />
            {LEVEL_LABEL[l]}
          </label>
        ))}
      </div>
      <div className="chips row wrap" style={{ gap: 4 }}>
        {EVIDENCES.map((e) => (
          <label key={e} className={`chip${evidence.has(e) ? '' : ' off'}`}>
            <input type="checkbox" checked={evidence.has(e)} onChange={() => setEvidence(toggle(evidence, e))} />
            <span className={`ev ev-${e}`} style={{ padding: '0 5px' }}>{e[0].toUpperCase() + e.slice(1)}</span>
          </label>
        ))}
      </div>
      <button
        className={`btn${documentedOnly ? ' primary' : ''}`}
        onClick={() => setEvidence(documentedOnly ? new Set(EVIDENCES) : new Set<Evidence>(['documented', 'press']))}
      >
        {documentedOnly ? 'Show all evidence' : 'Hide synthetic and interview items'}
      </button>
      <div className="muted small">Scores are recomputed on whatever is visible.</div>
    </div>
  )
}

function NodePanel(props: {
  actor: Actor
  power: { formal: PowerResult; real: PowerResult }
  layer: Layer
  graph: Graph
  typeMap: Map<string, TieType>
  expanded: boolean
  setExpanded: (b: boolean) => void
  onClose: () => void
  onSelect: (id: string) => void
}) {
  const { actor, power, layer, graph, typeMap, expanded, setExpanded, onClose, onSelect } = props
  const cur = power[layer]
  const formal = power.formal.score.get(actor.id)
  const real = power.real.score.get(actor.id)
  const drivers = (cur.drivers.get(actor.id) ?? []).slice(0, 3)
  const hints = useMemo(
    () => (cur.score.has(actor.id) ? leverageHints(actor.id, graph.nodes.map((n) => n.id), graph.ties, typeMap, layer, data.params.power, cur) : []),
    [actor.id, graph, typeMap, layer, cur],
  )
  const children = data.actors.filter((a) => a.parent === actor.id)
  const parent = actor.parent ? actorById.get(actor.parent) : undefined
  return (
    <Drawer kicker={`${SECTOR_LABEL[actor.sector]} · ${LEVEL_LABEL[actor.level]}`} title={actor.name} accent={SECTOR_COLOR[actor.sector]} onClose={onClose}>
      <dl>
        <dt>Role</dt><dd>{actor.role}</dd>
        <dt>Stance</dt><dd>{STANCE_LABEL[actor.stance] ?? actor.stance}</dd>
        <dt>Power score</dt>
        <dd>
          {formal === undefined ? 'hidden by filters' : (
            <>
              Formal <b>{formal.toFixed(2)}</b> · Real <b>{real!.toFixed(2)}</b>{' '}
              <span className="muted">({real! - formal >= 0 ? '+' : '−'}{Math.abs(real! - formal).toFixed(2)} gap)</span>
            </>
          )}
        </dd>
      </dl>
      <div className="small">{actor.summary}</div>
      {actor.quote && <div className="quote small">{actor.quote}</div>}
      <div>
        <div className="section-title">What drives the {layer} score</div>
        {drivers.length === 0 ? (
          <div className="small muted">No tie in this layer gives this actor standing, so it sits at the baseline.</div>
        ) : (
          <ul className="drivers small">
            {drivers.map((d) => (
              <li key={d.from}>
                Standing from <button className="linkish" onClick={() => onSelect(d.from)}>{actorById.get(d.from)?.name}</button>{' '}
                via {[...new Set(d.ties.map((t) => typeMap.get(t.type)?.label.toLowerCase()))].join(', ')}{' '}
                <span className="muted">(+{d.contribution.toFixed(2)})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hints.length > 0 && (
        <div>
          <div className="section-title">How could they gain leverage?</div>
          <ul className="drivers small">
            {hints.map((h) => (
              <li key={h.partner}>
                If <button className="linkish" onClick={() => onSelect(h.partner)}>{actorById.get(h.partner)?.name}</button>{' '}
                {h.type === 'must_consult' ? 'had a legal duty to consult them' : 'actually considered their interests'}:{' '}
                score {cur.score.get(actor.id)!.toFixed(2)} → <b>{h.newScore.toFixed(2)}</b>
              </li>
            ))}
          </ul>
          <div className="small muted">Each line adds one hypothetical tie (strength 2) from a top-10 actor and recomputes. See Tab 2 for when to act.</div>
        </div>
      )}
      {children.length > 0 && (
        <div>
          <div className="section-title">Segments</div>
          <div className="small">{children.map((c) => c.name).join(' · ')}</div>
          <button className="btn" style={{ marginTop: 6 }} onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Collapse into one node' : 'Expand into segments'}
          </button>
        </div>
      )}
      {parent && (
        <div className="small">
          Part of <button className="linkish" onClick={() => onSelect(parent.id)}>{parent.name}</button>
        </div>
      )}
      {actor.clerk_url && (
        <a className="small" href={actor.clerk_url} target="_blank" rel="noreferrer">City Clerk record for PD 1434</a>
      )}
      <EvidenceTag evidence={actor.evidence} source={actor.source} />
    </Drawer>
  )
}

function EdgePanel(props: {
  edge: DrawnEdge
  ripple: { id: string; step: number; via: string }[]
  typeMap: Map<string, TieType>
  onClose: () => void
  onSelect: (id: string) => void
}) {
  const { edge, ripple, typeMap, onClose, onSelect } = props
  const type = typeMap.get(edge.type)
  const from = actorById.get(edge.from)!
  const to = actorById.get(edge.to)!
  const flows = [...new Set(edge.ties.flatMap((t) => t.flows))]
  const amounts = edge.ties.map((t) => t.amount).filter(Boolean)
  const gainer = type?.power_to === 'target' ? to.name : type?.power_to === 'source' ? from.name : 'both parties'
  return (
    <Drawer kicker={`Tie · ${type?.label ?? edge.type}`} title={<>{from.name} → {to.name}</>} accent={GROUP_COLOR[TYPE_GROUP[edge.type]]} onClose={onClose}>
      <dl>
        <dt>How</dt><dd>{type?.label} — {type?.meaning.toLowerCase()}</dd>
        <dt>What flows</dt><dd>{flows.join(', ')}</dd>
        {amounts.length > 0 && (<><dt>Amount</dt><dd>{amounts.join('; ')}</dd></>)}
        <dt>Strength</dt><dd>{edge.strength} of 3</dd>
        <dt>Layer</dt><dd>{edge.ties.map((t) => t.layer).join(', ')}</dd>
        <dt>Power goes to</dt><dd>{gainer} <span className="muted">(× {type?.multiplier})</span></dd>
      </dl>
      {edge.ties.map((t, i) => (
        <div key={i} className="small">
          {t.explain}
          <div style={{ marginTop: 6 }}><EvidenceTag evidence={t.evidence} source={t.source} /></div>
        </div>
      ))}
      <div>
        <div className="section-title">Ripple: reachable within 2 steps</div>
        {ripple.length === 0 ? (
          <div className="small muted">No further ties lead out from {to.name} in this view.</div>
        ) : (
          <ul className="ripple small">
            {ripple.map((r) => (
              <li key={r.id}>
                Step {r.step}: <button className="linkish" onClick={() => onSelect(r.id)}>{actorById.get(r.id)?.name}</button>{' '}
                <span className="muted">({typeMap.get(r.via)?.label.toLowerCase()})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  )
}

function Assumptions({ tieTypes, setTieTypes, onClose }: { tieTypes: TieType[]; setTieTypes: (t: TieType[]) => void; onClose: () => void }) {
  const update = (type: string, patch: Partial<TieType>) => setTieTypes(tieTypes.map((t) => (t.type === type ? { ...t, ...patch } : t)))
  return (
    <div className="card assumptions" onClick={(e) => e.stopPropagation()}>
      <div className="row">
        <h3 style={{ fontSize: 15 }}>Power assumptions</h3>
        <span className="spacer" />
        <button className="btn" onClick={() => setTieTypes(data.tieTypes)}>Reset</button>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
      <p className="small muted" style={{ margin: '6px 0 10px' }}>
        Which side of each tie gains standing. This is the most consequential modeling choice in the map. Changes apply
        live and are not saved (edit <code>data/tie_types.json</code> to keep them).
      </p>
      <table>
        <thead>
          <tr><th>Tie type</th><th>Standing goes to</th><th>Weight ×</th></tr>
        </thead>
        <tbody>
          {tieTypes.map((t) => (
            <tr key={t.type}>
              <td title={t.meaning}>{t.label}</td>
              <td>
                <select value={t.power_to} onChange={(e) => update(t.type, { power_to: e.target.value as TieType['power_to'] })}>
                  <option value="source">the actor (from)</option>
                  <option value="target">the one acted on (to)</option>
                  <option value="both">both</option>
                </select>
              </td>
              <td>
                <input type="number" min={0} max={2} step={0.25} value={t.multiplier} style={{ width: 64 }}
                  onChange={(e) => update(t.type, { multiplier: Number(e.target.value) })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
