import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function tsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.isFile() && entry.name.endsWith('.tsx') ? [path] : []
  })
}

const consumers = tsxFiles(resolve(process.cwd(), 'src'))
  .filter(path => readFileSync(path, 'utf8').includes('<DialogContent'))

describe('dialog consumer layout contract', () => {
  it('does not override shared mobile position, margin, transform, or height', () => {
    for (const path of consumers) {
      const source = readFileSync(path, 'utf8')
      const tags = source.match(/<DialogContent\b[\s\S]*?>/g) ?? []
      expect(tags.length, `No DialogContent found in ${path}`).toBeGreaterThan(0)

      for (const tag of tags) {
        for (const forbidden of [
          'mx-4', 'bottom-0', 'left-0', 'top-auto', 'w-full',
          'max-w-none', 'translate-x-0', 'translate-y-0',
        ]) {
          expect(tag, `${path} overrides ${forbidden}`).not.toContain(forbidden)
        }
        expect(tag, `${path} overrides shared max height`).not.toMatch(/\bmax-h-\[/)
      }
    }
  })
})
