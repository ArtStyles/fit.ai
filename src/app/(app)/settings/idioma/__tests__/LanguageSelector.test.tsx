import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  LanguageFeedback,
  LanguageSelector,
  languageSelectionReducer,
  persistLanguageSelection,
} from '../LanguageSelector'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/actions/settings', () => ({ updateLanguage: vi.fn() }))
vi.mock('@/components/i18n/I18nProvider', () => ({ useI18n: () => ({ t: (source: string) => source }) }))

const OPTIONS = [
  { value: 'es' as const, title: 'Español', description: 'Interfaz en español' },
  { value: 'en' as const, title: 'English', description: 'Interface in English' },
]

function renderSelector() {
  return renderToStaticMarkup(
    <LanguageSelector
      currentLanguage="es"
      legend="Idioma de la aplicación"
      options={OPTIONS}
    />,
  )
}

describe('LanguageSelector', () => {
  it('renders native radios without an empty live region', () => {
    const html = renderSelector()

    expect(html).toContain('Interfaz en español')
    expect(html).toContain('type="radio"')
    expect(html).toContain('name="language"')
    expect(html).toContain('checked=""')
    expect(html).not.toContain('role="status"')
  })

  it('moves to a blocked pending state and completes with one refresh on success', async () => {
    const initial = { selected: 'es' as const, pending: false, feedback: null }
    const pending = languageSelectionReducer(initial, {
      type: 'select',
      language: 'en',
      message: 'Saving language…',
    })

    expect(pending).toEqual({
      selected: 'en',
      pending: true,
      feedback: { message: 'Saving language…', tone: 'info' },
    })

    const refresh = vi.fn()
    const result = await persistLanguageSelection({
      language: 'en',
      save: async () => ({ ok: true }),
      refresh,
      fallbackError: 'Could not save the language.',
    })

    expect(result).toEqual({ ok: true })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(languageSelectionReducer(pending, {
      type: 'success',
      message: 'Language saved.',
    })).toEqual({
      selected: 'en',
      pending: false,
      feedback: { message: 'Language saved.', tone: 'success' },
    })
  })

  it.each([
    ['server failure', async () => ({ ok: false as const, error: 'Invalid language.' }), 'Invalid language.'],
    ['rejected action', async () => { throw new Error('offline') }, 'Could not save the language.'],
  ])('rolls back selection and skips refresh after %s', async (_scenario, save, expectedError) => {
    const pending = languageSelectionReducer(
      { selected: 'es' as const, pending: false, feedback: null },
      { type: 'select', language: 'en', message: 'Saving language…' },
    )
    const refresh = vi.fn()
    const result = await persistLanguageSelection({
      language: 'en',
      save,
      refresh,
      fallbackError: 'Could not save the language.',
    })

    expect(result).toEqual({ ok: false, error: expectedError })
    expect(refresh).not.toHaveBeenCalled()
    if (result.ok) throw new Error('expected a failed language persistence result')
    expect(languageSelectionReducer(pending, {
      type: 'failure',
      language: 'es',
      message: result.error,
    })).toEqual({
      selected: 'es',
      pending: false,
      feedback: { message: expectedError, tone: 'error' },
    })
  })

  it('renders exactly one live feedback path', () => {
    const html = renderToStaticMarkup(
      <LanguageFeedback feedback={{ message: 'Language saved.', tone: 'success' }} />,
    )

    expect(html.match(/role="status"/g)).toHaveLength(1)
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1)
    expect(html).toContain('Language saved.')
  })
})
