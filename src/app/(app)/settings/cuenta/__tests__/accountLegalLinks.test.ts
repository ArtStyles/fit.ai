import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const accountSettingsPage = readFileSync(
  new URL('../page.tsx', import.meta.url),
  'utf8',
)

describe('account settings legal links', () => {
  it('links directly to the user locale privacy route instead of the legacy redirect', () => {
    expect(accountSettingsPage).toContain("import { localizedPath } from '@/lib/i18n/routing'")
    expect(accountSettingsPage).toContain("localizedPath(language, 'privacy')")
    expect(accountSettingsPage).toContain('href={privacyHref}')
    expect(accountSettingsPage).not.toContain('href="/privacy"')
  })
})
