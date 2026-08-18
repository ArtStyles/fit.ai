import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

function emptyApplicationQuery() {
  const query: Record<string, unknown> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.order = vi.fn(() => query)
  query.limit = vi.fn(() => query)
  query.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
  return query
}

async function renderApplication(
  searchParams?: Record<string, string>,
  language: 'es' | 'en' = 'es',
) {
  const applicationQuery = emptyApplicationQuery()
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: async () => ({
      user: { id: 'applicant', email: 'ana@example.com' },
      profile: {
        avatar_url: null,
        full_name: 'Ana',
        language,
        timezone: 'America/Havana',
      },
      supabase: { from: () => applicationQuery },
    }),
  }))
  vi.doMock('@/components/navigation/FixedTopBar', () => ({
    FixedTopBar: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  }))
  vi.doMock('@/components/coaching/ApplicationForm', () => ({
    ApplicationForm: () => <div>Formulario profesional</div>,
  }))
  vi.doMock('@/components/coaching/ApplicationTimeline', () => ({
    ApplicationTimeline: () => <div>Seguimiento profesional</div>,
  }))

  const ApplicationPage = (await import('../page')).default
  return renderToStaticMarkup(await ApplicationPage({ searchParams }))
}

describe('Trainer application settings entry', () => {
  it('returns to settings when the application was opened from settings', async () => {
    const html = await renderApplication({ from: 'settings' })

    expect(html).toContain('href="/settings"')
    expect(html).toContain('aria-label="Volver a ajustes"')
  })

  it('keeps the trainer directory as the default return destination', async () => {
    const html = await renderApplication()

    expect(html).toContain('href="/trainers"')
    expect(html).toContain('aria-label="Volver a entrenadores"')
  })

  it('localizes the settings return label for an English profile', async () => {
    const html = await renderApplication({ from: 'settings' }, 'en')

    expect(html).toContain('href="/settings"')
    expect(html).toContain('aria-label="Back to settings"')
  })
})
