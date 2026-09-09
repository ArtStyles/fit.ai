import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'mobile/public')
mkdirSync(target, { recursive: true })
const assets = [
  ['public/icon.svg', 'icon.svg'],
  ['public/exercises/catalog/v1', 'exercises/catalog/v1'],
  ['node_modules/sql.js/dist/sql-wasm.wasm', 'sql-wasm.wasm'],
]
for (const [source, destination] of assets) {
  const from = resolve(root, source)
  if (!existsSync(from)) throw new Error(`Required offline asset is absent: ${source}`)
  const to = resolve(target, destination)
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
}
console.log('Offline catalogue, icon and SQLite runtime prepared.')
