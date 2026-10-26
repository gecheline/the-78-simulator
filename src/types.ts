export type Evidence = 'documented' | 'press' | 'interview' | 'synthetic'
export type Sector = 'governance' | 'private' | 'public' | 'actant'
export type Level = 'city' | 'county' | 'state' | 'regional' | 'federal' | 'none'
export type Layer = 'formal' | 'real'
export type PowerTo = 'source' | 'target' | 'both'

export interface Sourced {
  evidence: Evidence
  source: string
}

export interface Actor extends Sourced {
  id: string
  name: string
  sector: Sector
  level: Level
  kind: 'person' | 'org' | 'body' | 'actant'
  role: string
  stance: string
  summary: string
  quote: string
  parent?: string
  clerk_url?: string
}

export interface Tie extends Sourced {
  from: string
  to: string
  type: string
  layer: Layer | 'both'
  strength: number
  flows: string[]
  amount?: string
  explain: string
}

export interface TieType extends Sourced {
  type: string
  label: string
  meaning: string
  default_layer: Layer | 'both'
  power_to: PowerTo
  multiplier: number
}

export interface Channel extends Sourced {
  id: string
  label: string
  unit_note: string
}

export interface Segment extends Sourced {
  id: string
  label: string
  area: number | null
  tenure: string
  vulnerability: number
  vulnerability_note?: string
  actor_id: string
  land_trust_eligible: boolean
}

export interface Sensitivity extends Sourced {
  channel: string
  segment: string
  symbol: string
  weight: number
  range: [number, number]
  lag: string
  explain: string
  case_id?: string
  driven_by?: 'spillover'
}

export interface Decision extends Sourced {
  id: string
  kind: 'decision' | 'lever'
  label: string
  stacks_on: string | null
  stage: string
  venue: string
  description: string
  channel_shifts?: Record<string, number>
  uncertain_channels?: string[]
  targets?: string[]
  signal: Record<string, unknown>
}

export interface Stage extends Sourced {
  id: string
  label: string
  order: number
  date: string
  status: 'passed' | 'current' | 'upcoming'
  venue: string
  public: boolean
  interventions: string[]
}

export interface Case extends Sourced {
  id: string
  name: string
  city: string
  lesson: string
  links: string[]
  url: string
  citation_status: 'cited' | 'needs-review'
}

export interface SliderDef {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  help: string
}

export interface Params {
  power: { alpha: number; beta: number; alpha_cap_ratio: number }
  simulation: { draws: number; seed: number; weight_jitter: number }
  sliders: SliderDef[]
  ordinance_holds: number
}

export interface Area extends Sourced {
  area: number
  name: string
  population: number
  vulnerability_index: number
  factor_percentiles: Record<string, number>
}
