import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('PublicProfilePage settings access', () => {
  it('exposes the main settings screen from the owner profile top bar only', () => {
    const page = source('../page.tsx')

    expect(page).toContain('right={isMe ? (')
    expect(page).toContain('href="/settings"')
    expect(page).toContain('aria-label="Abrir ajustes del perfil"')
    expect(page).toContain('<Settings className="h-5 w-5" />')
  })
})
