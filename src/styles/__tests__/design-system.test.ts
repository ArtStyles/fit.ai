import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')
const layout = readFileSync(resolve(process.cwd(), 'src/app/layout.tsx'), 'utf8')

describe('global design system contract', () => {
  it('defines semantic surfaces, statuses, spacing, radius, and motion', () => {
    for (const token of [
      '--surface-1', '--surface-2', '--status-success', '--status-warning',
      '--space-1', '--space-6', '--radius-control', '--motion-fast',
    ]) expect(css).toContain(token)
  })

  it('allows zoom and renders a skip link', () => {
    expect(layout).not.toContain('userScalable: false')
    expect(layout).not.toContain('maximumScale: 1')
    expect(layout).toContain('<SkipLink')
  })
})
