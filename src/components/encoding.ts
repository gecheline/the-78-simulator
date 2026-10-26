// Visual encodings for the power map, shared by the graph and the legend.
import type { Evidence, Level, Sector } from '../types'

/**
 * A categorical palette drawn from the color world of Chinese mosaic and tile
 * work around Chicago's Chinatown — porcelain indigo, jade, cinnabar, brass —
 * rather than default chart-library hues. Validated with the dataviz skill's
 * `validate_palette.js` (light surface #f2f4ee): lightness band, chroma floor,
 * CVD separation and contrast all pass or sit in the legal warn band, which this
 * app covers with secondary encoding (shape, dash pattern, and direct labels
 * everywhere color appears). See MOSAIC_WASH below for the matching pastel tints.
 */
export const MOSAIC = {
  terracotta: '#C1693B',
  jade: '#1E8F72',
  gold: '#C98A1C',
  indigo: '#4A5FC1',
  vermillion: '#D1472E',
  teal: '#1F8FAE',
  violet: '#8A4FD1',
  rose: '#C65A82',
} as const
export const MOSAIC_WASH: Record<keyof typeof MOSAIC, string> = {
  terracotta: '#F5E3D6',
  jade: '#DCF0E9',
  gold: '#F6E8C9',
  indigo: '#E3E6F8',
  vermillion: '#F7DED7',
  teal: '#DCEFF4',
  violet: '#ECE1F9',
  rose: '#F7DFE7',
}

export const SECTOR_COLOR: Record<Sector, string> = {
  governance: MOSAIC.indigo,
  private: MOSAIC.terracotta,
  public: MOSAIC.jade,
  actant: '#938C7F',
}
export const SECTOR_LABEL: Record<Sector, string> = {
  governance: 'Governance',
  private: 'Private sector and development partners',
  public: 'Public sector (nonprofits, residents)',
  actant: 'Non-human actant',
}
export const LEVEL_LABEL: Record<Level, string> = {
  city: 'City',
  county: 'County',
  state: 'State',
  regional: 'Regional',
  federal: 'Federal',
  none: 'No jurisdiction',
}
export const EVIDENCE_DASH: Record<Evidence, string | undefined> = {
  documented: undefined,
  press: '5 3',
  interview: '1.2 2.6',
  synthetic: undefined,
}

/** Path for a node shape centred on 0,0. Shape encodes jurisdiction level. */
export function shapePath(level: Level, r: number): string {
  switch (level) {
    case 'city':
      return `M ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 Z`
    case 'county': {
      const s = r * 0.9
      return `M ${-s} ${-s} H ${s} V ${s} H ${-s} Z`
    }
    case 'state': {
      const s = r * 1.2
      return `M 0 ${-s} L ${s} 0 L 0 ${s} L ${-s} 0 Z`
    }
    case 'regional':
    case 'federal': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i + Math.PI / 6
        return `${(r * 1.08 * Math.cos(a)).toFixed(2)} ${(r * 1.08 * Math.sin(a)).toFixed(2)}`
      })
      return `M ${pts.join(' L ')} Z`
    }
    default: {
      const w = r * 1.35
      const h = r * 0.8
      const k = h * 0.7
      return `M ${-w + k} ${-h} H ${w - k} Q ${w} ${-h} ${w} ${-h + k} V ${h - k} Q ${w} ${h} ${w - k} ${h} H ${-w + k} Q ${-w} ${h} ${-w} ${h - k} V ${-h + k} Q ${-w} ${-h} ${-w + k} ${-h} Z`
    }
  }
}

/** Dash pattern per tie type — fine-grained detail, read on hover/click, not by color. */
export const TIE_DASH: Record<string, string | undefined> = {
  votes_on: undefined,
  appoints: '10 3 2 3',
  holds_land: undefined,
  funds: undefined,
  must_consult: '2 3',
  negotiates: '8 4',
  represents: '12 3',
  defers_to: '14 4',
  considers: '4 3',
  pressures: '1.5 3',
  claims_voice: '1.5 4',
}

/**
 * Eleven tie types is more than people can tell apart by color at a glance (color
 * "pops out" reliably for roughly 6 categories, per preattentive-processing limits).
 * So the graph colors by three coarse groups — the fast, default read — and keeps the
 * eleven exact types as dash patterns plus the on-click tie panel, for whoever wants it.
 */
export type TieGroup = 'decide' | 'resource' | 'relate'
export const GROUP_COLOR: Record<TieGroup, string> = {
  decide: '#332C3D',
  resource: MOSAIC.gold,
  relate: MOSAIC.violet,
}
export const GROUP_LABEL: Record<TieGroup, string> = {
  decide: 'Decides',
  resource: 'Money and land',
  relate: 'Relationships and pressure',
}
export const TYPE_GROUP: Record<string, TieGroup> = {
  votes_on: 'decide',
  appoints: 'decide',
  must_consult: 'decide',
  defers_to: 'decide',
  funds: 'resource',
  holds_land: 'resource',
  negotiates: 'relate',
  represents: 'relate',
  considers: 'relate',
  pressures: 'relate',
  claims_voice: 'relate',
}
/** Backward-compatible per-type style (dash + its group's color), for the tie detail panel. */
export const TIE_STYLE: Record<string, { dash?: string; color: string }> = Object.fromEntries(
  Object.keys(TIE_DASH).map((type) => [type, { dash: TIE_DASH[type], color: GROUP_COLOR[TYPE_GROUP[type]] }]),
)
