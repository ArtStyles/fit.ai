import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const scriptPath = resolve(root, 'scripts/capture-marketing-screenshots.ts')

function source(): string {
  return existsSync(scriptPath) ? readFileSync(scriptPath, 'utf8') : ''
}

describe('marketing screenshot capture script', () => {
  it('captures the six localized product screenshots from stable safe regions', () => {
    const script = source()

    for (const file of [
      'dashboard-es.webp',
      'session-es.webp',
      'progress-es.webp',
      'dashboard-en.webp',
      'session-en.webp',
      'progress-en.webp',
    ]) {
      expect(script).toContain(`public/marketing/${file}`)
    }

    expect(script).toContain('signInAsE2EUser')
    expect(script).toContain('cleanupE2EAccountFromEnvironment')
    expect(script).toContain('data-marketing-capture')
    expect(script).toContain('data-marketing-private')
    expect(script).toContain("waitUntil: 'commit'")
    expect(script).toContain('timeout: 120_000')
    expect(script).toContain('attempt <= 2')
    expect(script).toContain('animations: \'disabled\'')
    expect(script).toContain('image/webp')
    expect(script).toContain('writeFile(outputPath')
    expect(script).toContain('width: 390')
    expect(script).toContain('height: 844')
  })
})
