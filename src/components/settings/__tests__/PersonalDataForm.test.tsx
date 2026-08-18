import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import {
  INITIAL_PERSONAL_DATA_STATE,
  type PersonalDataActionState,
} from '@/lib/profile/personalData'
import { PersonalDataForm } from '../PersonalDataForm'

let actionState: PersonalDataActionState = INITIAL_PERSONAL_DATA_STATE

vi.mock('react-dom', async importOriginal => {
  const reactDom = await importOriginal<typeof import('react-dom')>()
  return {
    ...reactDom,
    useFormState: () => [actionState, vi.fn()],
    useFormStatus: () => ({ pending: false }),
  }
})

function renderWithProviders(element: React.ReactElement, language: 'es' | 'en' = 'es') {
  return renderToStaticMarkup(
    <I18nProvider language={language} syncDocumentLanguage={false}>
      {element}
    </I18nProvider>,
  )
}

afterEach(() => {
  actionState = INITIAL_PERSONAL_DATA_STATE
})

describe('PersonalDataForm', () => {
  const initial = { heightCm: 175, dateOfBirth: '1996-01-01', gender: 'other' as const }

  it('renders validated personal fields and a read-only current weight summary', () => {
    const html = renderWithProviders(
      <PersonalDataForm initial={initial} currentWeightKg={72.5} />,
    )

    expect(html).toContain('72.5 kg')
    expect(html).toContain('href="/medidas?from=settings"')
    expect(html).not.toContain('name="weightKg"')
    expect(html).toContain('aria-describedby="heightCm-help"')
    expect(html).toContain('aria-describedby="dateOfBirth-help"')
    expect(html).toContain('aria-describedby="gender-help"')
    expect(html).toContain('min="100"')
    expect(html).toContain('max="250"')
  })

  it('renders the missing-weight fallback without adding an editable weight control', () => {
    const html = renderWithProviders(
      <PersonalDataForm initial={{ heightCm: null, dateOfBirth: null, gender: null }} currentWeightKg={null} />,
    )

    expect(html).toContain('Sin peso registrado')
    expect(html).not.toContain('type="number" name="weightKg"')
  })

  it('renders all personal-data copy and gender options in English', () => {
    const html = renderWithProviders(
      <PersonalDataForm initial={initial} currentWeightKg={72.5} />,
      'en',
    )

    for (const copy of ['Personal information', 'Date of birth', 'Current weight', 'Log or update weight', 'Save personal information']) {
      expect(html).toContain(copy)
    }
    expect(html).not.toContain('Datos personales')
  })

  it('associates translated server field errors and status with the form', () => {
    actionState = {
      ok: false,
      message: null,
      formError: 'Revisa los campos indicados.',
      fieldErrors: { heightCm: 'La altura debe estar entre 100 y 250 cm.' },
    }

    const html = renderWithProviders(
      <PersonalDataForm initial={initial} currentWeightKg={72.5} />,
      'en',
    )

    expect(html).toContain('Review the highlighted fields.')
    expect(html).toContain('Height must be between 100 and 250 cm.')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('aria-describedby="heightCm-help heightCm-error"')
  })
})
