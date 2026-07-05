import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  const path = fileURLToPath(new URL(relativePath, import.meta.url))
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('localized public route files', () => {
  it('validates the locale and scopes the i18n provider without another html element', () => {
    const layout = source('../[locale]/layout.tsx')

    expect(layout).toContain('isPublicLocale')
    expect(layout).toContain('notFound()')
    expect(layout).toContain('<I18nProvider language={locale}>')
    expect(layout).not.toContain('<html')
  })

  it('renders bilingual temporary hero copy in the public main region', () => {
    const page = source('../[locale]/page.tsx')

    expect(page).toContain('id="app-main-content"')
    expect(page).toContain('Avanza con un plan que aprende de ti.')
    expect(page).toContain('Move forward with a plan that learns from you.')
  })

  it('permanently redirects the legacy selector alias to the neutral root', () => {
    const alias = source('../language-selector/page.tsx')

    expect(alias).toContain("permanentRedirect('/')")
  })

  it('prefers the forwarded locale over the stored language cookie', () => {
    const rootLayout = source('../layout.tsx')

    expect(rootLayout).toContain("headers().get('x-public-locale')")
    expect(rootLayout).toContain("cookies().get('fitai-language')")
  })
})
