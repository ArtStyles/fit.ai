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

  it('renders the approved bilingual home content in the public main region', () => {
    const page = source('../[locale]/page.tsx')
    const content = source('../../lib/marketing/homeContent.ts')
    const faq = source('../../components/marketing/MarketingFaq.tsx')

    expect(page).toContain('id="app-main-content"')
    expect(page).toContain('HOME_CONTENT')
    expect(page).toContain('<HeroSection')
    expect(page).toContain('<ProductPreviewSection previews={content.previews} locale={locale} />')
    expect(page).toContain('title={content.faqTitle}')
    expect(content).toContain('Convierte cada entrenamiento en el siguiente paso de tu progresión.')
    expect(content).toContain('Turn every workout into the next step in your progression.')
    expect(faq).toContain('<section')
    expect(faq.match(/<h2/g)).toHaveLength(1)
    expect(faq).toContain('<h3')
  })

  it('uses locale-matched product screenshot assets with optimized images and a development fallback', () => {
    const section = source('../../components/marketing/ProductPreviewSection.tsx')

    expect(section).toContain("import Image from 'next/image'")
    expect(section).toContain('locale: PublicLocale')
    expect(section).toContain('src={`/marketing/${preview.screen}-${locale}.webp`}')
    expect(section).toContain('alt={preview.alt}')
    expect(section).toContain('aspect-[390/844]')
    expect(section).toContain('PreviewFallback')
  })

  it('permanently redirects the legacy selector alias to the neutral root', () => {
    const alias = source('../language-selector/page.tsx')

    expect(alias).toContain("permanentRedirect('/')")
  })

  it('prefers the forwarded locale over the stored language cookie', () => {
    const rootLayout = source('../layout.tsx')

    expect(rootLayout).toContain("headers().get('x-public-locale') ?? storedLanguage")
    expect(rootLayout).toContain("cookies().get('fitai-language')")
  })
})
