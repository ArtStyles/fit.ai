import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { LanguageSelector } from '../LanguageSelector'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/actions/settings', () => ({ updateLanguage: vi.fn() }))
vi.mock('@/components/feedback/ToastProvider', () => ({ useToast: () => ({ showToast: vi.fn() }) }))
vi.mock('@/components/i18n/I18nProvider', () => ({ useI18n: () => ({ t: (source: string) => source }) }))

describe('LanguageSelector', () => {
  it('renders native language names and an accessible save status', () => {
    const html = renderToStaticMarkup(
      <LanguageSelector
        currentLanguage="es"
        legend="Idioma de la aplicación"
        options={[
          { value: 'es', title: 'Español', description: 'Interfaz en español' },
          { value: 'en', title: 'English', description: 'Interface in English' },
        ]}
      />,
    )

    expect(html).toContain('Interfaz en español')
    expect(html).toContain('role="status"')
    expect(html).toContain('checked=""')
  })

  it('provides native radio keyboard navigation between language options', () => {
    const html = renderToStaticMarkup(
      <LanguageSelector
        currentLanguage="es"
        legend="Idioma de la aplicación"
        options={[
          { value: 'es', title: 'Español', description: 'Interfaz en español' },
          { value: 'en', title: 'English', description: 'Interface in English' },
        ]}
      />,
    )

    expect(html).toContain('type="radio"')
    expect(html).toContain('name="language"')
  })
})
