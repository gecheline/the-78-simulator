// npm run check-data: catches broken edits to /data before the demo.
import fs from 'node:fs'
import path from 'node:path'

const load = (f) => JSON.parse(fs.readFileSync(path.resolve('data', f), 'utf8'))
const errors = []
const fail = (msg) => errors.push(msg)
const EVIDENCE = ['documented', 'press', 'interview', 'synthetic']

const actors = load('actors.json')
const ties = load('ties.json')
const tieTypes = load('tie_types.json')
const channels = load('channels.json')
const segments = load('segments.json')
const sens = load('sensitivities.json')
const decisions = load('decisions.json')
const stages = load('stages.json')
const cases = load('cases.json')

const actorIds = new Set(actors.map((a) => a.id))
const channelIds = new Set(channels.map((c) => c.id))
const segmentIds = new Set(segments.map((s) => s.id))
const typeIds = new Set(tieTypes.map((t) => t.type))
const stageIds = new Set(stages.map((s) => s.id))
const caseIds = new Set(cases.map((c) => c.id))

function checkEvidence(file, list, key) {
  list.forEach((r, i) => {
    const name = `${file}[${r[key] ?? i}]`
    if (!EVIDENCE.includes(r.evidence)) fail(`${name}: evidence must be one of ${EVIDENCE.join(', ')}`)
    if (!r.source) fail(`${name}: missing source`)
  })
}
function inRange(name, w) {
  if (typeof w !== 'number' || w < -1 || w > 1) fail(`${name}: weight ${w} outside [-1, 1]`)
}

checkEvidence('actors.json', actors, 'id')
checkEvidence('ties.json', ties, 'from')
checkEvidence('segments.json', segments, 'id')
checkEvidence('sensitivities.json', sens, 'segment')
checkEvidence('decisions.json', decisions, 'id')
checkEvidence('stages.json', stages, 'id')
checkEvidence('cases.json', cases, 'id')

if (actorIds.size !== actors.length) fail('actors.json: duplicate ids')
for (const a of actors) if (a.parent && !actorIds.has(a.parent)) fail(`actor ${a.id}: unknown parent ${a.parent}`)

ties.forEach((t, i) => {
  const n = `ties.json[${i}] ${t.from}->${t.to}`
  if (!actorIds.has(t.from)) fail(`${n}: unknown from`)
  if (!actorIds.has(t.to)) fail(`${n}: unknown to`)
  if (!typeIds.has(t.type)) fail(`${n}: unknown type ${t.type}`)
  if (!['formal', 'real', 'both'].includes(t.layer)) fail(`${n}: bad layer ${t.layer}`)
  if (![1, 2, 3].includes(t.strength)) fail(`${n}: strength must be 1-3`)
})

for (const s of segments) {
  if (s.actor_id && !actorIds.has(s.actor_id)) fail(`segment ${s.id}: unknown actor_id ${s.actor_id}`)
  if (s.vulnerability < 0 || s.vulnerability > 1) fail(`segment ${s.id}: vulnerability outside [0, 1]`)
}
sens.forEach((s, i) => {
  const n = `sensitivities.json[${i}] ${s.segment}/${s.channel}`
  if (!channelIds.has(s.channel)) fail(`${n}: unknown channel`)
  if (!segmentIds.has(s.segment)) fail(`${n}: unknown segment`)
  inRange(n, s.weight)
  s.range?.forEach((w) => inRange(`${n} range`, w))
  if (s.range && s.range[0] > s.range[1]) fail(`${n}: range low > high`)
  if (s.case_id && !caseIds.has(s.case_id)) fail(`${n}: unknown case ${s.case_id}`)
})
for (const d of decisions) {
  if (!stageIds.has(d.stage)) fail(`decision ${d.id}: unknown stage ${d.stage}`)
  if (!actorIds.has(d.venue)) fail(`decision ${d.id}: unknown venue ${d.venue}`)
  for (const [c, w] of Object.entries(d.channel_shifts ?? {})) {
    if (!channelIds.has(c)) fail(`decision ${d.id}: unknown channel ${c}`)
    inRange(`decision ${d.id}/${c}`, w)
  }
  for (const t of d.targets ?? []) if (!segmentIds.has(t)) fail(`decision ${d.id}: unknown target ${t}`)
}
for (const s of stages) if (!actorIds.has(s.venue)) fail(`stage ${s.id}: unknown venue ${s.venue}`)

if (errors.length) {
  console.error(`check-data: ${errors.length} problem(s)\n  ` + errors.join('\n  '))
  process.exit(1)
}
console.log(`check-data: OK (${actors.length} actors, ${ties.length} ties, ${segments.length} segments, ${sens.length} sensitivities, ${decisions.length} decisions)`)
