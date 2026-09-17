import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { isOwnedTrainerPhoto } from './trainer-photo-owner'
import { TrainerProfilePhotoField } from './TrainerProfilePhotoField'

afterEach(() => vi.unstubAllEnvs())
describe('mobile professional photo boundary', () => {
  it('refuses privileged photo verification without invoking a service client', async () => {
    expect(await isOwnedTrainerPhoto('owner', 'https://public.example.invalid/avatars/owner/avatar.webp')).toBe(false)
  })
  it('keeps the current photo in form data and exposes native upload and removal controls', () => {
    vi.stubEnv('VITE_WEB_APP_URL', 'https://web.example.invalid')
    const html = renderToStaticMarkup(createElement(I18nProvider, { language: 'en', children: createElement(TrainerProfilePhotoField, { photoUrl: 'https://photo.invalid/owner', error: undefined }) }))
    expect(html).toContain('type="hidden"'); expect(html).toContain('name="professionalPhotoUrl"'); expect(html).toContain('value="https://photo.invalid/owner"')
    expect(html).not.toContain('type="url"')
    expect(html).toContain('type="file"')
    expect(html).toContain('Upload professional photo')
    expect(html).toContain('Remove photo')
    expect(html).not.toContain('https://web.example.invalid/coach/profile')
    expect(html).not.toContain('Open on the web')
  })
})
