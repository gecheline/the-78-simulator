import { scaleLinear } from 'd3-scale'
import { geoCentroid, geoDistance, geoMercator, geoPath } from 'd3-geo'
import { useMemo } from 'react'
import { data, geo } from '../data'
import type { ScenarioResult, Sliders } from '../model/scenario'
import { MOSAIC } from './encoding'
import { useSize } from './useSize'

const WARD_ACTOR: Record<number, string> = { 3: 'dowell', 11: 'lee', 25: 'sigcho' }
const BRIDGEPORT: [number, number] = [-87.6512, 41.8352]
const PING_TOM = 'TOM (PING) MEML.'
const MAX_TRUST_PARCELS = 40
/** Diverging map tint: vermillion (loss) through paper to jade (gain) — the same
 * pair used for gain/loss everywhere else, instead of a generic red-blue ramp. */
const divergingTint = scaleLinear<string>().domain([-1, 0, 1]).range([MOSAIC.vermillion, '#F4F1E6', MOSAIC.jade]).clamp(true)

export function MapStrip({ result, sliders, landTrust, openActor }: {
  result: ScenarioResult; sliders: Sliders; landTrust: boolean; openActor: (id: string) => void
}) {
  const [ref, size] = useSize<HTMLDivElement>({ w: 900, h: 220 })

  const areaValue = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const r of result.segments) {
      const a = data.segments.find((s) => s.id === r.segment)?.area
      if (a == null) continue
      m.set(a, [...(m.get(a) ?? []), r.median])
    }
    return new Map([...m].map(([a, v]) => [a, v.reduce((s, x) => s + x, 0) / v.length]))
  }, [result])
  const maxAbs = Math.max(0.5, ...[...areaValue.values()].map(Math.abs))
  const tint = (v: number | undefined) => (v === undefined ? '#E7E4D8' : divergingTint(v / maxAbs))

  const { path, project } = useMemo(() => {
    const frame: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [...geo.communityAreas.features, { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: BRIDGEPORT } }],
    }
    const projection = geoMercator().fitExtent([[10, 10], [size.w - 10, size.h - 10]], frame)
    return { path: geoPath(projection), project: (lonlat: [number, number]) => projection(lonlat) ?? [0, 0] }
  }, [size])

  const chinatown = geo.communityAreas.features.find((f) => Number(f.properties?.area_number) === 34)
  const trustPins = useMemo(() => {
    if (!landTrust || !chinatown) return new Set<string>()
    const c = geoCentroid(chinatown)
    const n = Math.round((sliders.trust_share ?? 0) * MAX_TRUST_PARCELS)
    return new Set(
      [...geo.parcels].sort((a, b) => geoDistance([a.lon, a.lat], c) - geoDistance([b.lon, b.lat], c)).slice(0, n).map((p) => p.pin),
    )
  }, [landTrust, sliders.trust_share, chinatown])

  const site = geo.plannedDevelopments.features.find((f) => Number(f.properties?.pd_number) === 1434)
  const bp = project(BRIDGEPORT)
  const bpVal = areaValue.get(60)
  const synthFilled = geo.parcels.filter((p) => p.synthetic_fill).length

  return (
    <div className="map-strip">
      <div ref={ref} style={{ minHeight: 0 }}>
        <svg width={size.w} height={size.h} role="img" aria-label="Focus community areas tinted by net effect">
          {geo.communityAreas.features.map((f) => {
            const a = Number(f.properties?.area_number)
            const [cx, cy] = path.centroid(f)
            return (
              <g key={a}>
                <path className="area" d={path(f) ?? ''} fill={tint(areaValue.get(a))} />
                <text x={cx} y={cy} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>
                  {f.properties?.community} ({a})
                </text>
                <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 11.5, paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>
                  {areaValue.has(a) ? `net ${areaValue.get(a)! >= 0 ? '+' : '−'}${Math.abs(areaValue.get(a)!).toFixed(2)}` : ''}
                </text>
              </g>
            )
          })}
          {geo.plannedDevelopments.features.map((f, i) =>
            Number(f.properties?.pd_number) === 1434 ? null : <path key={i} d={path(f) ?? ''} fill="none" stroke={MOSAIC.indigo} strokeOpacity={0.16} strokeWidth={0.7} />,
          )}
          {geo.parks.features.map((f, i) => {
            const ping = f.properties?.park === PING_TOM
            return <path key={i} d={path(f) ?? ''} fill={MOSAIC.jade} fillOpacity={ping ? 0.5 : 0.16} stroke={ping ? MOSAIC.jade : 'none'} strokeWidth={1.5}><title>{f.properties?.park}</title></path>
          })}
          {site && (
            <g>
              <path d={path(site) ?? ''} fill={MOSAIC.indigo} fillOpacity={0.3} stroke={MOSAIC.indigo} strokeWidth={2} />
              <text x={path.centroid(site)[0]} y={path.centroid(site)[1]} textAnchor="middle" style={{ fontSize: 12, fontWeight: 800, fill: MOSAIC.indigo, paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>The 78</text>
            </g>
          )}
          {geo.wards.features.map((f) => {
            const w = Number(f.properties?.ward)
            const [cx, cy] = path.centroid(f)
            return (
              <g key={w} onClick={() => WARD_ACTOR[w] && openActor(WARD_ACTOR[w])} style={{ cursor: 'pointer' }}>
                <path className="ward" d={path(f) ?? ''}><title>{`Ward ${w}: open the alderperson in Tab 1`}</title></path>
                <text x={cx} y={cy - 22} textAnchor="middle" style={{ fontSize: 11, fill: '#564F61', fontWeight: 700 }}>Ward {w}</text>
              </g>
            )
          })}
          {geo.parcels.map((p) => {
            const [x, y] = project([p.lon, p.lat])
            const inTrust = trustPins.has(p.pin)
            return <circle key={p.pin} cx={x} cy={y} r={inTrust ? 3.6 : 1.6} fill={inTrust ? MOSAIC.gold : '#564F61'} fillOpacity={inTrust ? 0.95 : 0.4} stroke={inTrust ? '#fff' : 'none'} strokeWidth={0.8} />
          })}
          <g>
            <circle cx={bp[0]} cy={bp[1]} r={9} fill={tint(bpVal)} stroke="#564F61" strokeDasharray="2 2" />
            <text x={bp[0] + 13} y={bp[1] + 4} style={{ fontSize: 11.5, paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>
              Bridgeport (60) {bpVal !== undefined && `net ${bpVal >= 0 ? '+' : '−'}${Math.abs(bpVal).toFixed(2)}`} · outside focus GeoJSON
            </text>
          </g>
        </svg>
      </div>
      <div className="map-notes">
        <div className="section-title" style={{ marginBottom: 0 }}>Map</div>
        <div><b style={{ color: 'var(--loss)' }}>Vermillion</b> = loss, <b style={{ color: 'var(--gain)' }}>jade</b> = gain, by area average.</div>
        <div><b style={{ color: 'var(--indigo)' }}>Indigo</b> = The 78 (PD 1434). <b style={{ color: 'var(--jade)' }}>Green</b> = parks, Ping Tom Park bold. Faint lines = other planned developments. Dashed = wards (click to open the alderperson).</div>
        <div>
          <b>Dots</b> = {geo.parcels.length} city-owned parcels in the three areas.
          {landTrust && <> <b style={{ color: 'var(--gold)' }}>Gold</b> = {trustPins.size} parcels nearest Chinatown, "acquired" by the land trust.</>}
          <span className="muted"> {synthFilled} have synthetic size or value fills.</span>
        </div>
        <div className="muted">
          Vulnerability: Tree Equity Score index by area ({data.areas.map((a) => `${a.area}: ${a.vulnerability_index}`).join(', ')}), joined through the 2010 tract table.
        </div>
      </div>
    </div>
  )
}
