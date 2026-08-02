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

const exerciseImage = readFileSync(
  resolve(process.cwd(), 'src/components/exercises/ExerciseImage.tsx'),
  'utf8',
)

describe('dialog consumer layout contract', () => {
  it('does not override shared mobile position, margin, transform, or height', () => {
    for (const path of consumers) {
      const source = readFileSync(path, 'utf8')
      const tags = source.match(/<DialogContent\b[\s\S]*?>/g) ?? []
      expect(tags.length, `No DialogContent found in ${path}`).toBeGreaterThan(0)

      for (const tag of tags) {
        for (const forbidden of [
          'mx-4', 'bottom-0', 'left-0', 'top-auto', 'w-full',
          'max-w-none', 'translate-x-0', 'translate-y-0', 'overflow-y-auto',
        ]) {
          expect(tag, `${path} overrides ${forbidden}`).not.toContain(forbidden)
        }
        expect(tag, `${path} overrides shared max height`).not.toMatch(/\bmax-h-\[/)
        expect(tag, `${path} uses viewport-sized DialogContent geometry`).not.toMatch(
          /\b(?:(?:h|min-h|max-h)-(?:screen|dvh|svh|lvh)|(?:w|min-w|max-w)-(?:screen|dvw|svw|lvw))\b|\b(?:(?:h|min-h|max-h)-\[100(?:d|s|l)?vh\]|(?:w|min-w|max-w)-\[100(?:d|s|l)?vw\])/,
        )
      }
    }
  })

  it('keeps ExerciseImage viewport sizing inside the shared dialog bounds', () => {
    const dialogTag = exerciseImage.match(/<DialogContent\b[\s\S]*?>/)?.[0]
    expect(dialogTag).toBeDefined()
    expect(dialogTag).not.toContain('w-screen')
    expect(dialogTag).not.toContain('h-[100dvh]')
    expect(exerciseImage).toContain('className="flex w-full max-w-3xl flex-col items-center"')
    expect(exerciseImage).toContain('className="relative h-[78vh] w-full"')
  })
})
