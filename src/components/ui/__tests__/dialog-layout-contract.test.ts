import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dialog = readFileSync(new URL('../dialog.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../../styles/globals.css', import.meta.url), 'utf8')

function readRule(source: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull()
  return match?.[1] ?? ''
}

describe('shared dialog layout contract', () => {
  it('uses a safe mobile bottom sheet with a 44px close control', () => {
    expect(dialog).toContain('fitai-dialog-content')
    expect(dialog).toContain('h-11 w-11')
    expect(dialog).toContain('<span className="sr-only">Cerrar</span>')

    const mobile = readRule(css, '.fitai-dialog-content')
    expect(mobile).toContain('inset-inline: 1rem;')
    expect(mobile).toContain('bottom: 0;')
    expect(mobile).toContain('max-height: calc(100dvh - var(--app-safe-area-top) - 1.5rem);')
    expect(mobile).toContain('overflow-y: auto;')
    expect(css).toContain('padding-bottom: calc(1.5rem + var(--app-safe-area-bottom)) !important;')
    expect(css).toContain('fitai-dialog-sheet-in 280ms')
    expect(css).toContain('fitai-dialog-sheet-out 200ms')
  })

  it('restores centered geometry and restrained motion from 640px', () => {
    const desktopStart = css.indexOf('@media (min-width: 640px)')
    expect(desktopStart).toBeGreaterThan(-1)
    const desktop = readRule(css.slice(desktopStart), '.fitai-dialog-content')
    expect(desktop).toContain('left: 50%;')
    expect(desktop).toContain('top: 50%;')
    expect(desktop).toContain('transform: translate(-50%, -50%);')
    expect(desktop).toContain('max-height: calc(100dvh - 3rem);')
    expect(css).toContain('fitai-dialog-desktop-in 200ms')
    expect(css).toContain('fitai-dialog-desktop-out 150ms')
  })

  it('removes dialog and overlay motion for reduced-motion users', () => {
    const reducedStart = css.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(reducedStart).toBeGreaterThan(-1)
    const reduced = css.slice(reducedStart)
    expect(reduced).toContain('.fitai-dialog-content[data-state="open"]')
    expect(reduced).toContain('.fitai-dialog-content[data-state="closed"]')
    expect(reduced).toContain('animation: none;')
    expect(dialog).toContain('motion-reduce:data-[state=open]:animate-none')
    expect(dialog).toContain('motion-reduce:data-[state=closed]:animate-none')
  })
})
