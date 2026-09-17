import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
vi.mock('@/components/i18n/I18nProvider', () => ({ useI18n: () => ({ language: 'es' }) }))
vi.mock('./actions/avatar', () => ({ updateAvatar: vi.fn() }))
vi.mock('./storage', () => ({ getAppStore: vi.fn() }))
import { TrainerProfilePhotoField } from './TrainerProfilePhotoField'
it('renders native upload and clear controls with the existing photo carried into form submission', () => {
  const html = renderToStaticMarkup(<TrainerProfilePhotoField photoUrl="https://photo.test/me.webp" />)
  expect(html).toContain('type="file"')
  expect(html).toContain('Subir foto profesional')
  expect(html).toContain('name="professionalPhotoUrl" value="https://photo.test/me.webp"')
  expect(html).toContain('Quitar foto')
  expect(html).not.toContain('Abrir en la web')
})
