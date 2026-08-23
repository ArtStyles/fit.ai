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
  dismissProductNotification: vi.fn(),
  dismissNotificationAttention: vi.fn(),
  dismissPlanUpdateNotification: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/notifications',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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
        dismissalKey: 'plan-update:77777777-7777-4777-8777-777777777777:2026-08-20T07:00:00.000Z',
        promo: null,
      },
    })
  })

  it('keeps the aggregate unread total synchronized after successful reads', () => {
    expect(decrementUnreadCount(41)).toBe(40)
    expect(decrementUnreadCount(0)).toBe(0)
    expect(decrementUnreadCount(null)).toBeNull()
  })

  it('combines attention and recent activity without redundant summary surfaces', async () => {
    const html = renderToStaticMarkup(await NotificationsPage())

    expect(html).toContain('Sube el peso de forma gradual.')
    expect(html).toContain('Actividad reciente')
    expect(html).toContain('Solicitud aprobada')
    expect(html).toContain('Quitar notificación: Solicitud aprobada')
    expect(html).toContain('href="/settings/notificaciones"')
    expect(html).toContain('Preferencias')
    expect(html).toContain('max-w-3xl')
    expect(html).not.toContain('Centro personal')
    expect(html).not.toContain('notificaciones sin leer')
    expect(html).not.toContain('Prioridad')
    expect(html).not.toContain('Requiere tu atención')
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

    expect(html).toContain('No pudimos comprobar las acciones prioritarias')
    expect(html).not.toContain('No pudimos calcular tus pendientes')
    expect(html).not.toContain('Todo está al día')
  })

  it('does not show an empty-history panel below an active plan notice', async () => {
    actionMocks.list.mockResolvedValue({
      notifications: [],
      nextCursor: null,
      unreadCount: 0,
    })

    const html = renderToStaticMarkup(await NotificationsPage())

    expect(html).toContain('Sube el peso de forma gradual.')
    expect(html).not.toContain('No tienes notificaciones todavía')
  })
})
