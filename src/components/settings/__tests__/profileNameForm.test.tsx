import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { ProfileNameForm } from '../ProfileNameForm'

let actionState = {
  ok: false,
  message: null as string | null,
  fieldErrors: {} as { fullName?: string },
}

vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>()
  return { ...react, useActionState: () => [actionState, vi.fn()] }
})

vi.mock('../SettingsSaveBar', () => ({
  SettingsSaveBar: () => <button type="submit">Save</button>,
}))

function renderForm() {
  return renderToStaticMarkup(
    <I18nProvider language="en" syncDocumentLanguage={false}>
      <ProfileNameForm initialName="Ana" />
    </I18nProvider>,
  )
}

describe('ProfileNameForm', () => {
  it('translates the server field error for English settings users', () => {
    actionState = {
      ok: false,
      message: null,
      fieldErrors: { fullName: 'El nombre no puede superar 100 caracteres.' },
    }

    const html = renderForm()

    expect(html).toContain('Name cannot exceed 100 characters.')
    expect(html).not.toContain('El nombre no puede superar 100 caracteres.')
  })

  it('translates the server success status for English settings users', () => {
    actionState = { ok: true, message: 'Nombre actualizado.', fieldErrors: {} }

    const html = renderForm()

    expect(html).toContain('Name updated.')
    expect(html).not.toContain('Nombre actualizado.')
  })
})
