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

function readBlock(source: string, marker: string) {
  const start = source.indexOf(marker)
  expect(start, `Missing block for ${marker}`).toBeGreaterThan(-1)
  const openingBrace = source.indexOf('{', start)
  let depth = 0

  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(openingBrace + 1, index)
  }

  throw new Error(`Unclosed block for ${marker}`)
}

function readAllBlocks(source: string, marker: string) {
  const blocks: string[] = []
  let searchFrom = 0

  while (searchFrom < source.length) {
    const start = source.indexOf(marker, searchFrom)
    if (start === -1) return blocks
    const openingBrace = source.indexOf('{', start)
    let depth = 0

    for (let index = openingBrace; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1
      if (source[index] === '}') depth -= 1
      if (depth === 0) {
        blocks.push(source.slice(openingBrace + 1, index))
        searchFrom = index + 1
        break
      }
    }
  }

  return blocks
}

describe('shared dialog layout contract', () => {
  it('uses a safe mobile bottom sheet with a 44px close control', () => {
    expect(dialog).toContain('fitai-dialog-content')
    expect(dialog).toContain('h-12 w-12')
    expect(dialog).toContain('<span className="sr-only">Cerrar</span>')

    const mobile = readRule(css, '.fitai-dialog-content')
    expect(mobile).toContain('inset-inline: 1rem;')
    expect(mobile).toContain('bottom: 0;')
    expect(mobile).toContain('max-height: calc(100dvh - var(--app-safe-area-top) - 1.5rem);')
    expect(mobile).toContain('overflow: hidden;')
    expect(css).toContain('padding-bottom: calc(1.5rem + var(--app-safe-area-bottom)) !important;')
    expect(css).toContain('fitai-dialog-sheet-in 280ms')
    expect(css).toContain('fitai-dialog-sheet-out 200ms')
  })

  it('keeps document safe-area padding outside the Tailwind base layer', () => {
    const base = readAllBlocks(css, '@layer base').join('\n')
    expect(base).not.toContain('padding-top: var(--app-safe-area-top);')
    expect(base).not.toContain('padding-right: var(--app-safe-area-right);')
    expect(base).not.toContain('padding-left: var(--app-safe-area-left);')

    const documentSafeAreaStart = css.indexOf('/* Document safe-area insets must outrank Tailwind Preflight. */')
    expect(documentSafeAreaStart).toBeGreaterThan(-1)
    const documentSafeArea = readRule(css.slice(documentSafeAreaStart), 'body')
    expect(documentSafeArea).toContain('padding-top: var(--app-safe-area-top);')
    expect(documentSafeArea).toContain('padding-right: var(--app-safe-area-right);')
    expect(documentSafeArea).toContain('padding-left: var(--app-safe-area-left);')
    expect(documentSafeArea).not.toContain('padding-bottom:')
    expect(documentSafeArea).not.toContain('!important')

    const scrollLockedBody = readRule(css, 'html body[data-scroll-locked]')
    expect(scrollLockedBody).toContain('padding-top: var(--app-safe-area-top);')
    expect(scrollLockedBody).toContain('padding-right: var(--app-safe-area-right);')
    expect(scrollLockedBody).toContain('padding-left: var(--app-safe-area-left);')
    expect(scrollLockedBody).not.toContain('padding-bottom:')
    expect(scrollLockedBody).not.toContain('!important')
  })

  it('keeps the close control outside an internal scrolling layout region', () => {
    expect(dialog).toContain('data-fitai-dialog-scroll-region')
    expect(dialog).toContain('fitai-dialog-scroll-region')
    expect(dialog).toContain('"pr-14"')

    const scrollRegion = readRule(css, '.fitai-dialog-scroll-region')
    expect(scrollRegion).toContain('min-height: 0;')
    expect(scrollRegion).toContain('overflow-y: auto;')
    expect(scrollRegion).toContain('display: inherit;')
    expect(scrollRegion).toContain('gap: inherit;')

    const regionStart = dialog.indexOf('data-fitai-dialog-scroll-region')
    const closeStart = dialog.indexOf('<DialogPrimitive.Close')
    expect(regionStart).toBeGreaterThan(-1)
    expect(closeStart).toBeGreaterThan(regionStart)
  })

  it('restores centered geometry and restrained motion from 640px', () => {
    const components = readBlock(css, '@layer components')
    const desktopMedia = readBlock(components, '@media (min-width: 640px)')
    const desktop = readRule(desktopMedia, '.fitai-dialog-content')
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
