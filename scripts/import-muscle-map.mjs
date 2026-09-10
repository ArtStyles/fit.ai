// Mechanical conversion of original MIT geometry; never reads openGym assets.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const commit = '7dc03071e03052e8bd4f6351e9176994cd28aa7d'
const expectedSourceHashes = {
  'MaleFrontPaths.swift': '0fc450daa30e0bab15cf5f558bcbaa7499960575af9c895c28e242cf49ed0740',
  'MaleBackPaths.swift': '082fd52c64923f5a19b0632764edd85b13afdfdc87e8b61fd6243868363a6cda',
  LICENSE: 'b008022459fbfd5fb6366cc64821c0083b792b15c80d061d51ceda1a45a8d296',
}
const sourceDirectory = process.argv[2]
if (!sourceDirectory) throw new Error('Usage: node scripts/import-muscle-map.mjs <original-source-directory>')
async function source(name) {
  const contents = await readFile(resolve(sourceDirectory, name))
  const actualHash = createHash('sha256').update(contents).digest('hex')
  if (actualHash !== expectedSourceHashes[name]) {
    throw new Error(`Unexpected SHA-256 for ${name}; expected original MuscleMap ${commit} source`)
  }
  return contents.toString('utf8')
}
const subgroups = new Set(['upperChest', 'lowerChest', 'innerQuad', 'outerQuad', 'upperAbs', 'lowerAbs', 'frontDeltoid'])
const models = []
for (const [side, file, viewBox] of [
  ['front', 'MaleFrontPaths.swift', '0 95 727 1280'],
  ['back', 'MaleBackPaths.swift', '718 95 727 1280'],
]) {
  const text = await source(file)
  const parts = text.split('BodyPartPathData(').slice(1).map(block => {
    const slug = block.match(/slug:\s*\.([A-Za-z]+)/)?.[1]
    if (!slug) throw new Error('Unrecognized original geometry')
    const paths = ['common', 'left', 'right'].flatMap(field => {
      const list = block.match(new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\]`))?.[1] ?? ''
      return [...list.matchAll(/"(?:\\.|[^"\\])*"/g)].map(([quoted]) => JSON.parse(quoted))
    })
    return { slug, paths }
  }).filter(part => !subgroups.has(part.slug) && part.paths.length)
  if (parts.length < 10) throw new Error('Incomplete original geometry')
  models.push({ side, viewBox, parts })
}
const license = await source('LICENSE')
if (!license.includes('MIT License') || !license.includes('Melih Colpan')) throw new Error('Unexpected upstream license')
await mkdir(resolve(root, 'src/lib/muscles'), { recursive: true })
await mkdir(resolve(root, 'public/third-party'), { recursive: true })
await writeFile(resolve(root, 'src/lib/muscles/geometry.json'), JSON.stringify({ source: 'https://github.com/melihcolpan/MuscleMap', commit, license: 'MIT', models }) + '\n')
await writeFile(resolve(root, 'public/third-party/MuscleMap-LICENSE.txt'), license)
console.log(`Prepared ${models.length} anatomical views from MuscleMap ${commit}; MIT notice included.`)
