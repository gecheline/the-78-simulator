import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from 'd3-sankey'
import { useMemo, useState } from 'react'
import { channelById, segmentById } from '../data'
import type { ScenarioResult } from '../model/scenario'
import type { Decision } from '../types'
import { useSize } from './useSize'

export type RippleSelection =
  | { kind: 'link'; channel: string; segment: string }
  | { kind: 'segment'; id: string }
  | { kind: 'channel'; id: string }
  | { kind: 'decision'; id: string }

interface N { id: string; label: string; col: 0 | 1 | 2 }
interface L { source: string; target: string; value: number; sign: number; col: 0 | 1 }

type SN = SankeyNode<N, L>
type SL = SankeyLink<N, L>

const MIN = 0.02
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function RippleSankey({ result, decisions, onSelect }: { result: ScenarioResult; decisions: Decision[]; onSelect: (s: RippleSelection) => void }) {
  const [ref, size] = useSize<HTMLDivElement>({ w: 700, h: 420 })
  const left = 190
  const right = 250

  const graph = useMemo(() => {
    const nodes: N[] = decisions.map((d) => ({ id: `d:${d.id}`, label: d.label.replace(/^\+ /, ''), col: 0 }))
    const links: L[] = []
    for (const b of result.byDecision)
      if (Math.abs(b.value) >= MIN) links.push({ source: `d:${b.decision}`, target: `c:${b.channel}`, value: Math.abs(b.value), sign: Math.sign(b.value), col: 0 })
    if (result.knockOns.length) {
      nodes.push({ id: 'd:knock', label: 'Knock-on effects', col: 0 })
      for (const k of result.knockOns)
        if (Math.abs(k.value) >= MIN) links.push({ source: 'd:knock', target: `c:${k.to}`, value: Math.abs(k.value), sign: Math.sign(k.value), col: 0 })
    }
    for (const s of result.segments)
      for (const t of s.terms)
        if (Math.abs(t.value) >= MIN) links.push({ source: `c:${t.channel}`, target: `s:${s.segment}`, value: Math.abs(t.value), sign: Math.sign(t.value), col: 1 })
    const used = new Set(links.flatMap((l) => [l.source, l.target]))
    for (const c of channelById.values()) if (used.has(`c:${c.id}`)) nodes.push({ id: `c:${c.id}`, label: c.label, col: 1 })
    for (const s of result.segments) if (used.has(`s:${s.segment}`)) nodes.push({ id: `s:${s.segment}`, label: segmentById.get(s.segment)!.label, col: 2 })
    const keep = nodes.filter((n) => used.has(n.id))
    // Channels that only receive (no segment is sensitive) still need to show, so keep them.
    const layout = sankey<N, L>()
      .nodeId((d) => d.id)
      .nodeAlign((n) => (n as SN & N).col)
      .nodeWidth(12)
      .nodePadding(7)
      .nodeSort(null)
      .extent([[left, 6], [Math.max(left + 200, size.w - right), Math.max(120, size.h - 6)]])
    return layout({ nodes: keep.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) })
  }, [result, decisions, size])

  const net = new Map(result.segments.map((s) => [s.segment, s.median]))
  const color = (l: SL) => (l.col === 0 ? (l.sign >= 0 ? 'var(--ink-2)' : 'var(--ink-3)') : l.sign >= 0 ? 'var(--gain)' : 'var(--loss)')

  // Nothing hovered: the whole ripple reads as one shape, an overview. Hover a node
  // or line and everything else recedes, so one flow is traced at a time instead of
  // all ~20 crossing lines being parsed at once.
  const [hoverNode, setHoverNode] = useState<string | null>(null)
  const touches = (l: L | SL, id: string) => (l.source as SN).id === id || (l.target as SN).id === id
  const focused = hoverNode != null

  return (
    <div ref={ref} style={{ flex: 1, minHeight: 0 }}>
      <svg width={size.w} height={size.h} role="img" aria-label="Ripple from decision to channels to segments">
        <g>
          {graph.links.map((l, i) => {
            const s = l.source as SN
            const t = l.target as SN
            const dim = focused && !touches(l, hoverNode!)
            return (
              <path
                key={i} className="sankey-link" d={sankeyLinkHorizontal()(l) ?? ''} stroke={color(l)}
                strokeWidth={Math.max(1.5, l.width ?? 1)} strokeOpacity={dim ? 0.12 : l.col === 0 ? 0.45 : 0.55}
                strokeDasharray={l.col === 0 && l.sign < 0 ? '6 3' : undefined}
                onMouseEnter={() => setHoverNode(s.id)} onMouseLeave={() => setHoverNode(null)}
                onClick={() => {
                  if (l.col === 1) onSelect({ kind: 'link', channel: s.id.slice(2), segment: t.id.slice(2) })
                  else onSelect({ kind: 'channel', id: t.id.slice(2) })
                }}
              >
                <title>{`${s.label} → ${t.label}: ${l.sign >= 0 ? '+' : '−'}${l.value.toFixed(2)}`}</title>
              </path>
            )
          })}
        </g>
        <g>
          {graph.nodes.map((n) => {
            const h = Math.max(2, (n.y1 ?? 0) - (n.y0 ?? 0))
            const col = n.col
            const v = col === 2 ? net.get(n.id.slice(2)) ?? 0 : 0
            const fill = col === 0 ? 'var(--indigo)' : col === 1 ? 'var(--teal)' : v >= 0 ? 'var(--gain)' : 'var(--loss)'
            const tx = col === 0 ? (n.x0 ?? 0) - 6 : (n.x1 ?? 0) + 6
            const dim = focused && hoverNode !== n.id && !graph.links.some((l) => touches(l, n.id) && touches(l, hoverNode!))
            return (
              <g
                key={n.id} className="sankey-node" opacity={dim ? 0.3 : 1}
                onMouseEnter={() => setHoverNode(n.id)} onMouseLeave={() => setHoverNode(null)}
                onClick={() => {
                  const id = n.id.slice(2)
                  onSelect(col === 0 ? { kind: 'decision', id } : col === 1 ? { kind: 'channel', id } : { kind: 'segment', id })
                }}
              >
                <rect x={n.x0} y={n.y0} width={(n.x1 ?? 0) - (n.x0 ?? 0)} height={h} fill={fill} rx={2} />
                <text x={tx} y={(n.y0 ?? 0) + h / 2 + 4} textAnchor={col === 0 ? 'end' : 'start'} style={col === 1 ? { paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 } : undefined}>
                  {truncate(n.label, col === 2 ? 30 : 26)}
                  {col === 2 && ` (${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)})`}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
