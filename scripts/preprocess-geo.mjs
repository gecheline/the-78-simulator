// One-time preprocessing: simplify the Data Sandbox GeoJSON and clip parcels to the
// three focus community areas. Writes data/geo/*.json. Run: npm run preprocess
// Set SANDBOX=/path/to/Data\ Sandbox if the folder is not next to this project.
import fs from 'node:fs'
import path from 'node:path'
import mapshaper from 'mapshaper'

const SANDBOX = process.env.SANDBOX || path.resolve('..', 'Data Sandbox')
const OUT = path.resolve('data', 'geo')
fs.mkdirSync(OUT, { recursive: true })

async function simplify(file, cmd, outName) {
  const input = fs.readFileSync(path.join(SANDBOX, file), 'utf8')
  const out = await mapshaper.applyCommands(
    `-i in.json ${cmd} -o out.json format=geojson precision=0.00001`,
    { 'in.json': input },
  )
  fs.writeFileSync(path.join(OUT, outName), out['out.json'])
  console.log(outName, (out['out.json'].length / 1024).toFixed(1), 'KB')
}

await simplify('community_areas_focus.geojson', '-simplify 12% keep-shapes', 'community_areas.json')
await simplify('wards_focus.geojson', '-simplify 8% keep-shapes', 'wards.json')
await simplify('parks_focus.geojson', '-filter-fields park,acres,ward,park_class -simplify 20% keep-shapes', 'parks.json')
// Only planned developments are kept: PD 1434 marks the site, other PDs are faint context.
await simplify(
  'zoning_focus.geojson',
  '-filter "zone_category === \'Planned Development\'" -filter-fields zone_class,pd_number,clerk_url -simplify 10% keep-shapes',
  'planned_developments.json',
)

// Parcels: keep the three focus areas. sq_ft and land_value are mostly empty in the
// source, so missing values get deterministic synthetic fills and are tagged.
const csv = fs.readFileSync(path.join(SANDBOX, 'city_owned_land_focus.csv'), 'utf8').trim().split(/\r?\n/)
const head = parseRow(csv[0])
const parcels = []
for (const line of csv.slice(1)) {
  const r = Object.fromEntries(parseRow(line).map((v, i) => [head[i], v]))
  if (!['31', '33', '34'].includes(r.community_area_number)) continue
  if (!r.latitude || !r.longitude) continue
  const h = hash(r.pin)
  const sqft = Number(r.sq_ft) || 0
  const value = Number(r.land_value) || 0
  parcels.push({
    pin: r.pin,
    address: r.address,
    area: Number(r.community_area_number),
    lon: +Number(r.longitude).toFixed(5),
    lat: +Number(r.latitude).toFixed(5),
    open_space: r.open_space_flag === 'Y',
    sq_ft: sqft || 2500 + (h % 5000),
    land_value: value || 40000 + (h % 160000),
    synthetic_fill: !sqft || !value,
  })
}
fs.writeFileSync(path.join(OUT, 'parcels.json'), JSON.stringify(parcels))
console.log('parcels.json', parcels.length, 'parcels')

function parseRow(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

function hash(s) {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return h
}
