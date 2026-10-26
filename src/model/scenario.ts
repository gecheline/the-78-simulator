// Scenario effects for Tab 2. Each segment's net effect is the sum over channels of
// shift x sensitivity, with losses amplified by vulnerability:
//   E_s = sum_c  D_c * w_cs * (1 + v_s * 1[D_c * w_cs < 0])
// Counter-levers adjust w before the sum. Pure functions, no UI.
import type { Decision, Segment, Sensitivity } from '../types'
import { mulberry32, quantile, uniform, type Rng } from './rng'

export type Sliders = Record<string, number>

export interface Levers {
  landTrust: boolean
  agreement: 'off' | 'cba' | 'ordinance'
}

export interface ScenarioInput {
  /** all active decisions, including the baseline they stack on */
  decisions: Decision[]
  levers: Levers
  sliders: Sliders
  segments: Segment[]
  sensitivities: Sensitivity[]
  channels: string[]
  leverTargets: Record<string, string[]>
  ordinanceHolds: number
  draws: number
  seed: number
  jitter: number
}

export interface Term {
  channel: string
  shift: number
  weight: number
  value: number
}

export interface SegmentPoint {
  segment: string
  total: number
  terms: Term[]
}

export interface SegmentResult extends SegmentPoint {
  median: number
  p10: number
  p90: number
  lossShare: number
  because: string
}

export interface KnockOn {
  from: string
  to: string
  coefficient: number
  value: number
}

export interface ScenarioResult {
  shifts: Record<string, number>
  directShifts: Record<string, number>
  /** each decision's own shift per channel, for the ripple view */
  byDecision: { decision: string; channel: string; value: number }[]
  knockOns: KnockOn[]
  segments: SegmentResult[]
}

const KNOCK_ONS: { from: string; to: string; slider: string; sign: number }[] = [
  { from: 'traffic', to: 'spending', slider: 'k_traffic_spending', sign: -1 },
  { from: 'transit', to: 'land_value', slider: 'k_transit_land', sign: 1 },
  { from: 'land_value', to: 'retail_comp', slider: 'k_land_retail', sign: 1 },
]

/** Sums the channel shifts of all active decisions. With rng, each shift is jittered. */
export function directShifts(decisions: Decision[], channels: string[], rng?: Rng, jitter = 0.2) {
  const total: Record<string, number> = Object.fromEntries(channels.map((c) => [c, 0]))
  const byDecision: ScenarioResult['byDecision'] = []
  for (const d of decisions) {
    for (const c of channels) {
      let v = d.channel_shifts?.[c] ?? 0
      if (d.uncertain_channels?.includes(c)) v = rng ? uniform(rng, -0.4, 0.4) : 0
      else if (rng && v !== 0) v = clamp(uniform(rng, v - jitter, v + jitter))
      total[c] += v
      if (v !== 0) byDecision.push({ decision: d.id, channel: c, value: v })
    }
  }
  return { total, byDecision }
}

/** One fuzzy-cognitive-map step: each link uses the direct shifts, applied once. */
export function applyKnockOns(direct: Record<string, number>, sliders: Sliders) {
  const shifts = { ...direct }
  const knockOns: KnockOn[] = []
  for (const k of KNOCK_ONS) {
    const coefficient = k.sign * (sliders[k.slider] ?? 0)
    const value = coefficient * (direct[k.from] ?? 0)
    if (value !== 0) {
      shifts[k.to] = (shifts[k.to] ?? 0) + value
      knockOns.push({ from: k.from, to: k.to, coefficient, value })
    }
  }
  return { shifts, knockOns }
}

/**
 * The segment's sensitivity weights after counter-levers. `agreementApplies` is the
 * share of the CBA or ordinance effect to apply: 1 or 0 in a single draw, the
 * probability it holds for the central estimate.
 */
export function segmentWeights(
  seg: Segment,
  sens: Sensitivity[],
  input: Pick<ScenarioInput, 'levers' | 'sliders' | 'leverTargets'>,
  agreementApplies: number,
  rng?: Rng,
): Record<string, number> {
  const { levers, sliders, leverTargets } = input
  const w: Record<string, number> = {}
  for (const s of sens) {
    if (s.segment !== seg.id) continue
    let v: number
    if (s.driven_by === 'spillover') {
      v = s.range[0] + (s.range[1] - s.range[0]) * (sliders.spillover ?? 0.5)
      if (rng) v = clamp(v + uniform(rng, -0.1, 0.1))
    } else {
      v = rng ? uniform(rng, s.range[0], s.range[1]) : s.weight
    }
    w[s.channel] = v
  }
  if (levers.landTrust && seg.land_trust_eligible && w.land_value !== undefined) {
    w.land_value *= 1 - (sliders.trust_share ?? 0)
  }
  const agreementId = levers.agreement === 'off' ? null : 'cba'
  if (agreementId && agreementApplies > 0 && leverTargets[agreementId]?.includes(seg.id)) {
    const cut = (sliders.cba_cut ?? 0) * agreementApplies
    for (const c of Object.keys(w)) if (w[c] < 0) w[c] *= 1 - cut
    w.affordable = (w.affordable ?? 0) + 0.4 * agreementApplies
  }
  return w
}

export function segmentEffect(
  seg: Segment,
  shifts: Record<string, number>,
  weights: Record<string, number>,
  vulnScale: number,
): SegmentPoint {
  const v = seg.vulnerability * vulnScale
  const terms: Term[] = []
  let total = 0
  for (const [c, w] of Object.entries(weights)) {
    const shift = shifts[c] ?? 0
    const raw = shift * w
    if (raw === 0) continue
    const value = raw < 0 ? raw * (1 + v) : raw
    terms.push({ channel: c, shift, weight: w, value })
    total += value
  }
  terms.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  return { segment: seg.id, total, terms }
}

const fmt = (x: number) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2)

/** The "because" line: built from the two largest terms of the computation. */
export function because(label: string, point: SegmentPoint, channelLabel: (c: string) => string): string {
  const [a, b] = point.terms
  if (!a) return `${label}: no channel in this scenario touches this group.`
  const verb = point.total >= 0 ? 'gain' : 'lose'
  const first = `${channelLabel(a.channel).toLowerCase()} (${fmt(a.value)})`
  if (!b) return `${label} ${verb} mainly through ${first}.`
  const second = `${channelLabel(b.channel).toLowerCase()} (${fmt(b.value)})`
  const sameSign = Math.sign(a.value) === Math.sign(b.value)
  return sameSign
    ? `${label} ${verb} mainly through ${first} and ${second}.`
    : `${label} ${verb} mainly through ${first}, partly offset by ${second}.`
}

export function agreementHoldProbability(input: Pick<ScenarioInput, 'levers' | 'sliders' | 'ordinanceHolds'>) {
  if (input.levers.agreement === 'off') return 0
  return input.levers.agreement === 'ordinance' ? input.ordinanceHolds : (input.sliders.cba_holds ?? 0.5)
}

export function runScenario(input: ScenarioInput, channelLabel: (c: string) => string = (c) => c): ScenarioResult {
  const { decisions, segments, sensitivities, channels, sliders } = input
  const vulnScale = sliders.vuln_scale ?? 1
  const pHold = agreementHoldProbability(input)

  // Central estimate: weights at their stated values, agreement at its expected effect.
  const direct = directShifts(decisions, channels)
  const { shifts, knockOns } = applyKnockOns(direct.total, sliders)
  const points = segments.map((s) => segmentEffect(s, shifts, segmentWeights(s, sensitivities, input, pHold), vulnScale))

  // Repeated runs with a fixed seed: each weight drawn uniformly within its range.
  const rng = mulberry32(input.seed)
  const samples = segments.map(() => [] as number[])
  for (let k = 0; k < input.draws; k++) {
    const d = directShifts(decisions, channels, rng, input.jitter)
    const { shifts: sh } = applyKnockOns(d.total, sliders)
    const holds = rng() < pHold ? 1 : 0
    segments.forEach((s, i) => {
      samples[i].push(segmentEffect(s, sh, segmentWeights(s, sensitivities, input, holds, rng), vulnScale).total)
    })
  }

  const results: SegmentResult[] = segments.map((s, i) => {
    const sorted = samples[i].sort((a, b) => a - b)
    return {
      ...points[i],
      median: quantile(sorted, 0.5),
      p10: quantile(sorted, 0.1),
      p90: quantile(sorted, 0.9),
      lossShare: sorted.length ? sorted.filter((x) => x < 0).length / sorted.length : 0,
      because: because(s.label, points[i], channelLabel),
    }
  })

  return { shifts, directShifts: direct.total, byDecision: direct.byDecision, knockOns, segments: results }
}

function clamp(x: number) {
  return Math.max(-1, Math.min(1, x))
}
