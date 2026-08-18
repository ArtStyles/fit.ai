import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

async function renderSettings({
  language = 'es',
  trainerAccess,
}: {
  language?: 'es' | 'en'
  trainerAccess:
    | { granted: true; profile: { id: string } }
    | { granted: false; reason: 'missing_profile' | 'suspended' | 'inactive' }
}): Promise<string> {
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: async () => ({
      user: { id: 'settings-user', email: 'ana@example.com' },
      profile: { language, is_admin: false },
      supabase: { marker: 'settings-client' },
    }),
  }))
  vi.doMock('@/lib/coaching/access', () => ({
    getTrainerAccess: async () => trainerAccess,
  }))

  const SettingsPage = (await import('@/app/(app)/settings/page')).default
  return renderToStaticMarkup(await SettingsPage())
}

describe('Settings professional entry', () => {
  it('offers the trainer application from settings when professional access is missing', async () => {
    const html = await renderSettings({
      trainerAccess: { granted: false, reason: 'missing_profile' },
    })

    expect(html).toContain('href="/coach/apply?from=settings"')
    expect(html).toContain('Convertirme en entrenador')
  })

  it('opens the trainer workspace instead of another application for an active trainer', async () => {
    const html = await renderSettings({
      language: 'en',
      trainerAccess: { granted: true, profile: { id: 'trainer-profile' } },
    })

    expect(html).toContain('href="/coach"')
    expect(html).toContain('Trainer workspace')
    expect(html).not.toContain('href="/coach/apply?from=settings"')
  })
})
