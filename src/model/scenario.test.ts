import { describe, expect, it } from 'vitest'
import { applyKnockOns, because, runScenario, segmentEffect, type ScenarioInput } from './scenario'
import { data } from '../data'
import type { Decision, Segment } from '../types'

const sliders = Object.fromEntries(data.params.sliders.map((s) => [s.id, s.value]))
const dec = (ids: string[]) => ids.map((id) => data.decisions.find((d) => d.id === id)!) as Decision[]
const input = (ids: string[], over: Partial<ScenarioInput> = {}): ScenarioInput => ({
  decisions: dec(ids),
  levers: { landTrust: false, agreement: 'off' },
  sliders,
  segments: data.segments,
  sensitivities: data.sensitivities,
  channels: data.channels.map((c) => c.id),
  leverTargets: { cba: data.decisions.find((d) => d.id === 'cba')!.targets! },
  ordinanceHolds: data.params.ordinance_holds,
  draws: 200,
  seed: 78,
  jitter: 0.2,
  ...over,
})
const seg = (r: ReturnType<typeof runScenario>, id: string) => r.segments.find((s) => s.segment === id)!

describe('segment effect', () => {
  it('amplifies losses by vulnerability but not gains', () => {
    const s = { id: 'x', vulnerability: 0.5 } as Segment
    const p = segmentEffect(s, { a: 1, b: 1 }, { a: -0.4, b: 0.4 }, 1)
    expect(p.terms.find((t) => t.channel === 'a')!.value).toBeCloseTo(-0.6)
    expect(p.terms.find((t) => t.channel === 'b')!.value).toBeCloseTo(0.4)
    expect(p.total).toBeCloseTo(-0.2)
  })
})

describe('knock-ons', () => {
  it('apply once from the direct shifts', () => {
    const { shifts } = applyKnockOns({ traffic: 1, transit: 1, land_value: 0, spending: 0, retail_comp: 0 }, sliders)
    expect(shifts.spending).toBeCloseTo(-sliders.k_traffic_spending)
    expect(shifts.land_value).toBeCloseTo(sliders.k_transit_land)
    expect(shifts.retail_comp).toBeCloseTo(0) // uses direct land value (0), not the knocked-on one
  })
})

describe('scenarios', () => {
  it('is reproducible with a fixed seed', () => {
    expect(seg(runScenario(input(['baseline'])), 'ct_seniors').p10).toBe(seg(runScenario(input(['baseline'])), 'ct_seniors').p10)
  })
  it('adding the garage pushes senior renters further down', () => {
    expect(seg(runScenario(input(['baseline', 'garage'])), 'ct_seniors').total).toBeLessThan(seg(runScenario(input(['baseline'])), 'ct_seniors').total)
  })
  it('the land trust helps tenant businesses and costs legacy owners', () => {
    const off = runScenario(input(['baseline', 'garage']))
    const on = runScenario(input(['baseline', 'garage'], { levers: { landTrust: true, agreement: 'off' } }))
    expect(seg(on, 'ct_tenant').total).toBeGreaterThan(seg(off, 'ct_tenant').total)
    expect(seg(on, 'ct_legacy').total).toBeLessThan(seg(off, 'ct_legacy').total)
  })
  it('an ordinance reduces named losses', () => {
    const off = runScenario(input(['baseline']))
    const on = runScenario(input(['baseline'], { levers: { landTrust: false, agreement: 'ordinance' } }))
    expect(seg(on, 'ct_seniors').total).toBeGreaterThan(seg(off, 'ct_seniors').total)
  })
  it('ranges bracket the median and loss share is a fraction', () => {
    for (const s of runScenario(input(['baseline'])).segments) {
      expect(s.p10).toBeLessThanOrEqual(s.median)
      expect(s.median).toBeLessThanOrEqual(s.p90)
      expect(s.lossShare).toBeGreaterThanOrEqual(0)
      expect(s.lossShare).toBeLessThanOrEqual(1)
    }
  })
  it('builds the because line from the two largest terms', () => {
    const p = { segment: 'x', total: -1.1, terms: [{ channel: 'land_value', shift: 0.8, weight: -0.8, value: -0.64 }, { channel: 'traffic', shift: 0.8, weight: -0.8, value: -0.51 }] }
    expect(because('Senior renters', p, (c) => (c === 'land_value' ? 'Land value' : 'Event traffic'))).toBe(
      'Senior renters lose mainly through land value (−0.64) and event traffic (−0.51).',
    )
  })
})
