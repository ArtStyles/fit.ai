import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const geometry = JSON.parse(readFileSync(resolve(root, 'src/lib/muscles/geometry.json'), 'utf8'))
const regions = JSON.parse(readFileSync(resolve(root, 'src/lib/exercises/personal-illustration-regions.json'), 'utf8'))
const output = resolve(root, 'public/exercises/personal')
mkdirSync(output, { recursive: true })
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

for (const [muscle, parts] of Object.entries(regions)) {
  const bodies = geometry.models.map((model, index) => {
    const shapes = model.parts.flatMap(part => part.paths.map(path => {
      const highlighted = parts.includes(part.slug)
      return `<path d="${escape(path)}" fill="${highlighted ? '#b69aff' : '#555060'}" stroke="${highlighted ? '#cbbbff' : '#16121f'}" stroke-width="${highlighted ? 3 : 4}"${highlighted ? ' data-highlight="true"' : ''}/>`
    })).join('\n')
    return `<svg data-view="${escape(model.side)}" x="${index ? 249 : 27}" y="25" width="204" height="414" viewBox="${escape(model.viewBox)}">\n${shapes}\n</svg>`
  }).join('\n')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" data-muscle="${escape(muscle)}">
<!-- Generic muscle-location illustration. Geometry: MuscleMap, MIT; ${escape(geometry.source)} @ ${escape(geometry.commit)}. License: /third-party/MuscleMap-LICENSE.txt -->
<rect width="480" height="480" rx="36" fill="#14101d"/>
<rect x="1" y="1" width="478" height="478" rx="35" fill="none" stroke="#332a45" stroke-width="2"/>
${bodies}
<path d="M222 450l18 12 18-12" fill="none" stroke="#b69aff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>\n`
  writeFileSync(resolve(output, `${muscle}.svg`), svg)
}
console.log(`Generated ${Object.keys(regions).length} local muscle-region illustrations.`)
