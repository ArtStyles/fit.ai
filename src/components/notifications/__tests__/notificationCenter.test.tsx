import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { ToastProvider } from '@/components/feedback/ToastProvider'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/settings/notificaciones',
}))

import {
  getSafeInternalNotificationUrl,
  loadNextNotificationPage,
  markNotificationReadInteraction,
  mergeProductNotifications,
  NotificationCenter,
  type ProductNotificationView,
} from '../NotificationCenter'

const FIRST: ProductNotificationView = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'trainer.request.accepted',
  title: 'Solicitud aceptada',
  body: 'Tu entrenador aceptó la solicitud.',
  url: '/trainers/relationships/active',
  readAt: null,
  createdAt: '2026-08-07T15:00:00.000Z',
}

const SECOND: ProductNotificationView = {
  id: '00000000-0000-4000-8000-000000000002',
  type: 'trainer.routine.assigned',
  title: 'Rutina disponible',
  body: 'Ya puedes comenzar tu nueva rutina.',
  url: '/plan',
  readAt: '2026-08-07T14:30:00.000Z',
  createdAt: '2026-08-07T14:00:00.000Z',
}

function renderWithProviders(element: ReactElement): string {
  return renderToStaticMarkup(
    <I18nProvider language="es" syncDocumentLanguage={false}>
      <ToastProvider>{element}</ToastProvider>
    </I18nProvider>,
  )
}

describe('NotificationCenter', () => {
  it('orders notifications by (created_at, id) descending and de-duplicates pages', () => {
    const sameTimeLowerId = { ...FIRST, id: '00000000-0000-4000-8000-000000000003' }
    const sameTimeHigherId = { ...FIRST, id: '00000000-0000-4000-8000-000000000004', title: 'Más reciente' }

    const merged = mergeProductNotifications(
      [SECOND, sameTimeLowerId],
      [sameTimeHigherId, SECOND],
    )

    expect(merged.map(item => item.id)).toEqual([
      sameTimeHigherId.id,
      sameTimeLowerId.id,
      SECOND.id,
    ])
  })

  it.each([
    ['/trainers', '/trainers'],
    ['/plan?source=trainer#week-1', '/plan?source=trainer#week-1'],
    ['//evil.example/path', null],
    ['https://evil.example/path', null],
    ['/trainers\\evil', null],
    ['/%5C%5Cevil.example/path', null],
    ['/%2F%2Fevil.example/path', null],
    ['\\evil.example', null],
    ['', null],
    [null, null],
  ])('accepts only safe internal notification URLs: %s', (url, expected) => {
    expect(getSafeInternalNotificationUrl(url)).toBe(expected)
  })

  it('renders unread state, accessible feedback and only a validated internal destination', () => {
    const html = renderWithProviders(
      <NotificationCenter
        initialPage={{
          notifications: [SECOND, FIRST],
          nextCursor: 'next-page',
        }}
      />,
    )

    expect(html.indexOf('Solicitud aceptada')).toBeLessThan(html.indexOf('Rutina disponible'))
    expect(html).toContain('Nueva')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Abrir: Solicitud aceptada')
    expect(html).toContain('Cargar más')
    expect(html).toContain('min-h-11')
  })

  it('does not expose an unsafe destination as navigation', () => {
    const html = renderWithProviders(
      <NotificationCenter
        initialPage={{
          notifications: [{ ...FIRST, url: '//evil.example/path' }],
          nextCursor: null,
        }}
      />,
    )

    expect(html).not.toContain('evil.example')
    expect(html).not.toContain('Abrir:')
    expect(html).toContain('Marcar como leída')
  })

  it('renders a useful empty state', () => {
    const html = renderWithProviders(
      <NotificationCenter initialPage={{ notifications: [], nextCursor: null }} />,
    )

    expect(html).toContain('No tienes notificaciones todavía')
  })

  it('renders an initial loading error visibly and accessibly instead of an empty inbox', () => {
    const html = renderWithProviders(
      <NotificationCenter
        initialPage={{
          notifications: [],
          nextCursor: null,
          error: 'No se pudieron cargar las notificaciones.',
        }}
      />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('No se pudieron cargar las notificaciones.')
    expect(html).not.toContain('No tienes notificaciones todavía')
  })

  it('loads a page through the interaction flow and returns its live announcement', async () => {
    const result = await loadNextNotificationPage({
      cursor: 'next-page',
      notifications: [FIRST],
    }, async ({ cursor }) => {
      expect(cursor).toBe('next-page')
      return { notifications: [SECOND], nextCursor: null }
    })

    expect(result).toEqual({
      ok: true,
      notifications: [FIRST, SECOND],
      cursor: null,
      announcement: '1 notificaciones cargadas.',
      error: null,
      toast: null,
    })
  })

  it('turns a rejected page load into visible feedback data for announcement and toast', async () => {
    const result = await loadNextNotificationPage({
      cursor: 'next-page',
      notifications: [FIRST],
    }, async () => {
      throw new Error('network unavailable')
    })

    expect(result).toEqual({
      ok: false,
      notifications: [FIRST],
      cursor: 'next-page',
      error: 'No se pudieron cargar las notificaciones.',
      announcement: 'No se pudieron cargar las notificaciones.',
      toast: {
        title: 'No se pudieron cargar las notificaciones.',
        variant: 'error',
      },
    })
  })

  it('turns a rejected mark-read interaction into feedback without changing the item', async () => {
    const result = await markNotificationReadInteraction(FIRST, async id => {
      expect(id).toBe(FIRST.id)
      throw new Error('server action unavailable')
    })

    expect(result).toEqual({
      ok: false,
      notification: FIRST,
      error: 'No se pudo marcar la notificación.',
      announcement: 'No se pudo marcar la notificación.',
      toast: { title: 'No se pudo marcar la notificación.', variant: 'error' },
    })
  })
})

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

async function renderNotificationSettings(communityEnabled: boolean): Promise<string> {
  vi.doMock('@/lib/features/community', () => ({
    isCommunityEnabled: () => communityEnabled,
  }))
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: () => Promise.resolve({
      user: { id: 'user-1' },
      profile: { language: 'es' },
      supabase: {
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { preferred_workout_days: [1, 3, 5] } }),
              maybeSingle: () => Promise.resolve({
                data: table === 'product_notification_preferences'
                  ? { professional_enabled: true, push_enabled: true }
                  : {
                    likes_enabled: true,
                    comments_enabled: true,
                    follows_enabled: true,
                    follow_requests_enabled: true,
                  },
              }),
            }),
          }),
        }),
      },
    }),
  }))

  const NotificationsSettingsPage = (await import('@/app/(app)/settings/notificaciones/page')).default
  const { ToastProvider: CurrentToastProvider } = await import('@/components/feedback/ToastProvider')
  const { I18nProvider: CurrentI18nProvider } = await import('@/components/i18n/I18nProvider')
  const page = await NotificationsSettingsPage()
  return renderToStaticMarkup(
    <CurrentI18nProvider language="es" syncDocumentLanguage={false}>
      <CurrentToastProvider>{page}</CurrentToastProvider>
    </CurrentI18nProvider>,
  )
}

describe('notification settings visibility', () => {
  it('always shows professional preferences and hides social preferences when Community is disabled', async () => {
    const html = await renderNotificationSettings(false)

    expect(html).toContain('Notificaciones profesionales')
    expect(html).not.toContain('Actividad social')
  })

  it('adds social preferences only when Community is enabled', async () => {
    const html = await renderNotificationSettings(true)

    expect(html).toContain('Notificaciones profesionales')
    expect(html).toContain('Actividad social')
  })
})
