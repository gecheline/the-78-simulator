// Power scores for Tab 1: Katz status on the formal and the real layer, plus
// Krackhardt's hierarchy index and the leverage hint. Pure functions, no UI.
import type { Layer, PowerTo, Tie, TieType } from '../types'

export interface PowerParams {
  alpha: number
  beta: number
  /** alpha is capped at this fraction of 1/lambda_max so the series converges */
  alpha_cap_ratio: number
}

export interface Endorsement {
  /** S[u][v] > 0 means u's tie gives standing to v */
  S: number[][]
  /** ties behind each S[u][v] entry, for explanations */
  why: Map<string, Tie[]>
}

export interface Driver {
  from: string
  contribution: number
  ties: Tie[]
}

export interface PowerResult {
  layer: Layer
  /** 0-1, scaled for the y-axis */
  score: Map<string, number>
  raw: Map<string, number>
  alphaUsed: number
  hierarchy: number
  drivers: Map<string, Driver[]>
}

export const inLayer = (t: Tie, layer: Layer) => t.layer === layer || t.layer === 'both'

export function buildEndorsement(
  nodes: string[],
  ties: Tie[],
  tieTypes: Map<string, TieType>,
  layer: Layer,
): Endorsement {
  const idx = new Map(nodes.map((n, i) => [n, i]))
  const S = nodes.map(() => nodes.map(() => 0))
  const why = new Map<string, Tie[]>()
  const add = (u: number, v: number, w: number, t: Tie) => {
    if (u === v) return
    S[u][v] += w
    const k = `${u}|${v}`
    why.set(k, [...(why.get(k) ?? []), t])
  }
  for (const t of ties) {
    if (!inLayer(t, layer)) continue
    const f = idx.get(t.from)
    const to = idx.get(t.to)
    const type = tieTypes.get(t.type)
    if (f === undefined || to === undefined || !type) continue
    const w = t.strength * type.multiplier
    const dir: PowerTo = type.power_to
    if (dir === 'target' || dir === 'both') add(f, to, w, t)
    if (dir === 'source' || dir === 'both') add(to, f, w, t)
  }
  return { S, why }
}

/** Largest eigenvalue of a non-negative matrix by power iteration. */
export function spectralRadius(S: number[][], iters = 200): number {
  const n = S.length
  if (n === 0) return 0
  let x = new Array(n).fill(1 / n)
  let lambda = 0
  for (let k = 0; k < iters; k++) {
    const y = new Array(n).fill(0)
    for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) y[v] += S[u][v] * x[u]
    const norm = y.reduce((s, a) => s + a, 0)
    if (norm === 0) return 0
    lambda = norm / x.reduce((s, a) => s + a, 0)
    x = y.map((a) => a / norm)
  }
  return lambda
}

/** Solves x = alpha * S^T x + beta by fixed-point iteration. */
export function katz(S: number[][], alpha: number, beta: number, iters = 300): number[] {
  const n = S.length
  let x = new Array(n).fill(beta)
  for (let k = 0; k < iters; k++) {
    const next = new Array(n).fill(beta)
    for (let u = 0; u < n; u++) {
      const xu = x[u]
      if (xu === 0) continue
      const row = S[u]
      for (let v = 0; v < n; v++) if (row[v]) next[v] += alpha * row[v] * xu
    }
    let diff = 0
    for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(next[i] - x[i]))
    x = next
    if (diff < 1e-10) break
  }
  return x
}

/**
 * Krackhardt hierarchy: 1 - (mutually reachable ordered pairs / reachable ordered pairs).
 * Reachability follows the direction standing flows (u -> v means v ranks above u).
 * 0 = everyone can reach everyone (flat), 1 = no reciprocity (strict hierarchy).
 */
export function hierarchyIndex(S: number[][]): number {
  const n = S.length
  const reach = S.map((_, s) => {
    const seen = new Array(n).fill(false)
    const stack = [s]
    while (stack.length) {
      const u = stack.pop()!
      for (let v = 0; v < n; v++) {
        if (S[u][v] > 0 && !seen[v]) {
          seen[v] = true
          stack.push(v)
        }
      }
    }
    seen[s] = false
    return seen
  })
  let reachable = 0
  let mutual = 0
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j || !reach[i][j]) continue
      reachable++
      if (reach[j][i]) mutual++
    }
  return reachable === 0 ? 0 : 1 - mutual / reachable
}

function scale01(x: number[]): number[] {
  const lo = Math.min(...x)
  const hi = Math.max(...x)
  return x.map((v) => (hi === lo ? 0.5 : (v - lo) / (hi - lo)))
}

export function computePower(
  nodes: string[],
  ties: Tie[],
  tieTypes: Map<string, TieType>,
  layer: Layer,
  params: PowerParams,
): PowerResult {
  const { S, why } = buildEndorsement(nodes, ties, tieTypes, layer)
  const lambda = spectralRadius(S)
  const alphaUsed = lambda > 0 ? Math.min(params.alpha, params.alpha_cap_ratio / lambda) : params.alpha
  const x = katz(S, alphaUsed, params.beta)
  const scaled = scale01(x)

  const drivers = new Map<string, Driver[]>()
  nodes.forEach((v, j) => {
    const list: Driver[] = []
    nodes.forEach((u, i) => {
      if (S[i][j] > 0) list.push({ from: u, contribution: alphaUsed * S[i][j] * x[i], ties: why.get(`${i}|${j}`) ?? [] })
    })
    list.sort((a, b) => b.contribution - a.contribution)
    drivers.set(v, list)
  })

  return {
    layer,
    score: new Map(nodes.map((n, i) => [n, scaled[i]])),
    raw: new Map(nodes.map((n, i) => [n, x[i]])),
    alphaUsed,
    hierarchy: hierarchyIndex(S),
    drivers,
  }
}

export interface LeverageHint {
  partner: string
  type: string
  newScore: number
  gain: number
}

/**
 * For a node, try one new tie from each of the 10 highest-scoring nodes and return
 * the 3 that would raise its score the most. Formal layer: a duty to consult.
 * Real layer: having its interests actually considered.
 */
export function leverageHints(
  node: string,
  nodes: string[],
  ties: Tie[],
  tieTypes: Map<string, TieType>,
  layer: Layer,
  params: PowerParams,
  base: PowerResult,
): LeverageHint[] {
  const type = layer === 'formal' ? 'must_consult' : 'considers'
  const current = base.score.get(node) ?? 0
  const top = [...base.score.entries()]
    .filter(([id]) => id !== node)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  const hints = top.map(([partner]) => {
    const extra: Tie = {
      from: partner, to: node, type, layer, strength: 2, flows: ['information'],
      evidence: 'synthetic', source: 'leverage hint', explain: '',
    }
    const r = computePower(nodes, [...ties, extra], tieTypes, layer, params)
    const newScore = r.score.get(node) ?? 0
    return { partner, type, newScore, gain: newScore - current }
  })
  return hints.sort((a, b) => b.gain - a.gain).slice(0, 3)
}
