import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const toast = readFileSync(new URL('../ToastProvider.tsx', import.meta.url), 'utf8')

describe('toast layout contract', () => {
  it('positions the viewport below top safe area and inside lateral safe areas', () => {
    expect(toast).toContain('top-[calc(var(--app-safe-area-top)_+_1rem)]')
    expect(toast).toContain('right-[calc(var(--app-safe-area-right)_+_1rem)]')
    expect(toast).toContain(
      'w-[calc(100vw_-_var(--app-safe-area-left)_-_var(--app-safe-area-right)_-_2rem)]',
    )
  })

  it('provides a 44px close target and removes state motion when requested', () => {
    expect(toast).toContain('flex h-11 w-11')
    expect(toast).toContain('motion-reduce:data-[state=open]:animate-none')
    expect(toast).toContain('motion-reduce:data-[state=closed]:animate-none')
    expect(toast).toContain('aria-label="Cerrar notificacion"')
  })
})
