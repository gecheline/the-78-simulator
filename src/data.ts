// All content comes from the flat JSON files in /data and is bundled at build time,
// so the app works offline and loads without network requests.
import actors from '../data/actors.json'
import ties from '../data/ties.json'
import tieTypes from '../data/tie_types.json'
import channels from '../data/channels.json'
import segments from '../data/segments.json'
import sensitivities from '../data/sensitivities.json'
import decisions from '../data/decisions.json'
import stages from '../data/stages.json'
import cases from '../data/cases.json'
import params from '../data/params.json'
import areas from '../data/areas.json'
import communityAreas from '../data/geo/community_areas.json'
import wards from '../data/geo/wards.json'
import parks from '../data/geo/parks.json'
import plannedDevelopments from '../data/geo/planned_developments.json'
import parcels from '../data/geo/parcels.json'
import { geoArea } from 'd3-geo'
import type { Actor, Area, Case, Channel, Decision, Params, Segment, Sensitivity, Stage, Tie, TieType } from './types'

export const data = {
  actors: actors as Actor[],
  ties: ties as Tie[],
  tieTypes: tieTypes as TieType[],
  channels: channels as Channel[],
  segments: segments as Segment[],
  sensitivities: sensitivities as Sensitivity[],
  decisions: decisions as Decision[],
  stages: stages as Stage[],
  cases: cases as Case[],
  params: params as Params,
  areas: areas as Area[],
}

export interface Parcel {
  pin: string
  address: string
  area: number
  lon: number
  lat: number
  open_space: boolean
  sq_ft: number
  land_value: number
  synthetic_fill: boolean
}

// d3-geo wants clockwise outer rings; GeoJSON (RFC 7946) uses counter-clockwise.
// A ring with the wrong winding covers the whole globe, so reverse those.
function rewind(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  for (const f of fc.features) {
    const g = f.geometry
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
    for (const rings of polys) {
      if (geoArea({ type: 'Polygon', coordinates: [rings[0]] }) > 2 * Math.PI) for (const r of rings) r.reverse()
    }
  }
  return fc
}

export const geo = {
  communityAreas: rewind(communityAreas as GeoJSON.FeatureCollection),
  wards: rewind(wards as GeoJSON.FeatureCollection),
  parks: rewind(parks as GeoJSON.FeatureCollection),
  plannedDevelopments: rewind(plannedDevelopments as GeoJSON.FeatureCollection),
  parcels: parcels as Parcel[],
}

export const actorById = new Map(data.actors.map((a) => [a.id, a]))
export const tieTypeById = new Map(data.tieTypes.map((t) => [t.type, t]))
export const channelById = new Map(data.channels.map((c) => [c.id, c]))
export const segmentById = new Map(data.segments.map((s) => [s.id, s]))
export const caseById = new Map(data.cases.map((c) => [c.id, c]))
export const stageById = new Map(data.stages.map((s) => [s.id, s]))
