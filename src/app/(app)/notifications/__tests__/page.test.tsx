import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const actionMocks = vi.hoisted(() => ({
  list: vi.fn(),
  attention: vi.fn(),
}))

vi.mock('@/app/actions/notifications', () => ({
  listProductNotifications: actionMocks.list,
  loadNotificationAttention: actionMocks.attention,
  markProductNotificationRead: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/notifications',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({
    language: 'es',
    timeZone: 'America/Havana',
    t: (source: string) => source,
  }),
}))

import NotificationsPage from '../page'
import { decrementUnreadCount } from '@/components/notifications/NotificationsPageContent'

describe('dedicated notifications page', () => {
  beforeEach(() => {
    actionMocks.list.mockReset().mockResolvedValue({
      notifications: [{
        id: '00000000-0000-4000-8000-000000000001',
        type: 'trainer.update',
        title: 'Solicitud aprobada',
        body: 'Ya puedes continuar con tu perfil profesional.',
        url: '/coach/profile',
        readAt: null,
        createdAt: '2026-08-20T13:00:00.000Z',
      }],
      nextCursor: null,
      unreadCount: 41,
    })
    actionMocks.attention.mockReset().mockResolvedValue({
      status: 'ready',
      attention: {
        notice: { kind: 'ai-notes', text: 'Sube el peso de forma gradual.' },
        aiNotes: 'Sube el peso de forma gradual.',
        planName: 'Fuerza base',
        promo: null,
      },
    })
  })

  it('keeps the aggregate unread total synchronized after successful reads', () => {
    expect(decrementUnreadCount(41)).toBe(40)
    expect(decrementUnreadCount(0)).toBe(0)
    expect(decrementUnreadCount(null)).toBeNull()
  })

  it('combines dashboard attention and recent activity in a full dedicated route', async () => {
    const html = renderToStaticMarkup(await NotificationsPage())

    expect(html).toContain('Requiere tu atención')
    expect(html).toContain('Sube el peso de forma gradual.')
    expect(html).toContain('Actividad reciente')
    expect(html).toContain('Solicitud aprobada')
    expect(html).toContain('href="/settings/notificaciones"')
    expect(html).toContain('Preferencias')
    expect(html).toContain('max-w-4xl')
    expect(html).toContain('41 notificaciones sin leer')
    expect(html).not.toContain('role="dialog"')
    expect(html).not.toContain('aria-expanded=')
  })

  it('does not present unavailable data as an all-clear state', async () => {
    actionMocks.list.mockResolvedValue({
      notifications: [],
      nextCursor: null,
      unreadCount: null,
      error: 'No se pudieron cargar las notificaciones.',
    })
    actionMocks.attention.mockResolvedValue({ status: 'error' })

    const html = renderToStaticMarkup(await NotificationsPage())

    expect(html).toContain('No pudimos calcular tus pendientes')
    expect(html).toContain('No pudimos comprobar las acciones prioritarias')
    expect(html).not.toContain('Todo está al día')
  })
})
