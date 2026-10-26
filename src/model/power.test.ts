import { describe, expect, it } from 'vitest'
import { buildEndorsement, computePower, hierarchyIndex, katz, leverageHints } from './power'
import { data, tieTypeById } from '../data'
import type { Tie } from '../types'

const P = { alpha: 0.1, beta: 1, alpha_cap_ratio: 0.85 }
const tie = (from: string, to: string, type: string, layer: Tie['layer'] = 'both', strength = 1): Tie => ({
  from, to, type, layer, strength, flows: [], evidence: 'synthetic', source: 'test', explain: '',
})

describe('endorsement directions', () => {
  it('defers_to gives standing to the target, funds to the source', () => {
    const { S } = buildEndorsement(['a', 'b'], [tie('a', 'b', 'defers_to', 'real')], tieTypeById, 'real')
    expect(S[0][1]).toBeGreaterThan(0)
    const f = buildEndorsement(['a', 'b'], [tie('a', 'b', 'funds', 'formal')], tieTypeById, 'formal')
    expect(f.S[1][0]).toBeGreaterThan(0)
  })
  it('ignores ties from the other layer', () => {
    const { S } = buildEndorsement(['a', 'b'], [tie('a', 'b', 'defers_to', 'real')], tieTypeById, 'formal')
    expect(S[0][1]).toBe(0)
  })
})

describe('katz', () => {
  it('matches the closed form on a two-node chain', () => {
    // x_b = alpha * x_a + beta, x_a = beta
    const x = katz([[0, 1], [0, 0]], 0.1, 1)
    expect(x[0]).toBeCloseTo(1)
    expect(x[1]).toBeCloseTo(1.1)
  })
})

describe('hierarchy index', () => {
  it('is 1 for a strict chain and 0 for a cycle', () => {
    expect(hierarchyIndex([[0, 1, 0], [0, 0, 1], [0, 0, 0]])).toBe(1)
    expect(hierarchyIndex([[0, 1, 0], [0, 0, 1], [1, 0, 0]])).toBe(0)
  })
})

describe('the 78 network', () => {
  const nodes = data.actors.map((a) => a.id)
  const formal = computePower(nodes, data.ties, tieTypeById, 'formal', P)
  const real = computePower(nodes, data.ties, tieTypeById, 'real', P)

  it('scores fall in [0, 1]', () => {
    for (const r of [formal, real]) for (const v of r.score.values()) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
  it('Dowell ranks higher in real influence than in formal power', () => {
    const rank = (r: typeof formal, id: string) => [...r.score.entries()].sort((a, b) => b[1] - a[1]).findIndex(([n]) => n === id)
    expect(rank(real, 'dowell')).toBeLessThan(rank(formal, 'dowell'))
  })
  it('Chinatown senior renters lose standing from formal to real', () => {
    expect(real.score.get('ct_seniors')!).toBeLessThanOrEqual(formal.score.get('ct_seniors')!)
  })
  it('leverage hints return up to 3 ties that raise the score', () => {
    const hints = leverageHints('ct_seniors', nodes, data.ties, tieTypeById, 'real', P, real)
    expect(hints.length).toBe(3)
    expect(hints[0].gain).toBeGreaterThan(0)
  })
})
