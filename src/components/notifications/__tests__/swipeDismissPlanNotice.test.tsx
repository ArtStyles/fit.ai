import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/notifications',
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('@/components/feedback/ToastProvider', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (source: string) => source }),
}))

vi.mock('@/app/actions/notifications', () => ({
  dismissNotificationAttention: vi.fn(),
  dismissPlanUpdateNotification: vi.fn(),
}))

import * as attentionModule from '../NotificationAttentionCard'

type DismissInteraction = (
  noticeKey: string,
  persist: (noticeKey: string) => Promise<{ ok: true } | { ok: false; error: string }>,
) => Promise<{
  ok: boolean
  announcement: string
  error: string | null
}>

function swipeExports() {
  const module = attentionModule as unknown as Record<string, unknown>
  expect(module.shouldDismissPlanNotice).toEqual(expect.any(Function))
  expect(module.dismissPlanNoticeInteraction).toEqual(expect.any(Function))
  return {
    shouldDismiss: module.shouldDismissPlanNotice as (offsetX: number, velocityX: number) => boolean,
    dismissInteraction: module.dismissPlanNoticeInteraction as DismissInteraction,
  }
}

function attentionDismissExport() {
  const module = attentionModule as unknown as Record<string, unknown>
  expect(module.dismissAttentionNoticeInteraction).toEqual(expect.any(Function))
  return module.dismissAttentionNoticeInteraction as DismissInteraction
}

describe('swipe-dismiss plan notice', () => {
  it('dismisses only a deliberate left swipe by distance or velocity', () => {
    const { shouldDismiss } = swipeExports()

    expect(shouldDismiss(-87, -649)).toBe(false)
    expect(shouldDismiss(-88, 0)).toBe(true)
    expect(shouldDismiss(-10, -650)).toBe(true)
    expect(shouldDismiss(120, 900)).toBe(false)
  })

  it('returns restorable feedback when persistence rejects or throws', async () => {
    const { dismissInteraction } = swipeExports()

    await expect(dismissInteraction('current-key', async () => ({ ok: true }))).resolves.toEqual({
      ok: true,
      announcement: 'Aviso quitado.',
      error: null,
    })
    await expect(dismissInteraction('current-key', async () => ({
      ok: false,
      error: 'No se pudo quitar el aviso.',
    }))).resolves.toEqual({
      ok: false,
      announcement: 'No se pudo quitar el aviso.',
      error: 'No se pudo quitar el aviso.',
    })
    await expect(dismissInteraction('current-key', async () => {
      throw new Error('offline')
    })).resolves.toEqual({
      ok: false,
      announcement: 'No se pudo quitar el aviso.',
      error: 'No se pudo quitar el aviso.',
    })
  })

  it('returns restorable feedback for other attention notices', async () => {
    const dismissInteraction = attentionDismissExport()

    await expect(dismissInteraction('promo:current', async () => ({ ok: true }))).resolves.toEqual({
      ok: true,
      announcement: 'Aviso quitado.',
      error: null,
    })
    await expect(dismissInteraction('check-in:current', async () => ({
      ok: false,
      error: 'No se pudo quitar el aviso.',
    }))).resolves.toEqual({
      ok: false,
      announcement: 'No se pudo quitar el aviso.',
      error: 'No se pudo quitar el aviso.',
    })
  })

  it('renders a compact plan row with swipe and keyboard dismissal affordances', () => {
    const html = renderToStaticMarkup(
      <attentionModule.NotificationAttentionCard
        attention={{
          notice: { kind: 'ai-notes', text: 'Aumenta la carga de forma gradual.' },
          aiNotes: 'Aumenta la carga de forma gradual.',
          planName: 'Hipertrofia · Semana 5',
          dismissalKey: 'plan-update:77777777-7777-4777-8777-777777777777:2026-08-20T07:00:00.000Z',
          promo: null,
        }}
      />,
    )

    expect(html).toContain('data-swipe-dismiss="plan-update"')
    expect(html).toContain('aria-label="Quitar aviso del plan"')
    expect(html).toContain('Hipertrofia · Semana 5')
    expect(html).toContain('Ver plan')
    expect(html).toContain('line-clamp-2')
    expect(html).toContain('aria-live="polite"')
  })

  it('renders accessible dismissal actions for profile review and promotion notices', () => {
    const checkIn = renderToStaticMarkup(
      <attentionModule.NotificationAttentionCard
        attention={{
          notice: { kind: 'check-in' },
          aiNotes: null,
          planName: 'Fuerza base',
          dismissalKey: 'check-in:2026-07-01T08:00:00.000Z',
          promo: null,
        }}
      />,
    )
    const promotion = renderToStaticMarkup(
      <attentionModule.NotificationAttentionCard
        attention={{
          notice: { kind: 'promo', title: 'Novedad' },
          aiNotes: null,
          planName: 'Fuerza base',
          dismissalKey: 'promo:dashboard-primary:2026-08-20T06:00:00.000Z',
          promo: {
            slot: 'dashboard-primary',
            kind: 'announcement',
            title: 'Novedad',
            description: 'Detalle',
            image_url: null,
            cta_label: null,
            cta_href: null,
            status: 'active',
            starts_on: null,
            ends_on: null,
            updated_at: '2026-08-20T06:00:00.000Z',
          },
        }}
      />,
    )

    expect(checkIn).toContain('aria-label="Quitar aviso de revisión del perfil"')
    expect(promotion).toContain('aria-label="Quitar promoción"')
    expect(checkIn).toContain('aria-live="polite"')
    expect(promotion).toContain('aria-live="polite"')
  })

  it('keeps the missing-plan notice mandatory', () => {
    const html = renderToStaticMarkup(
      <attentionModule.NotificationAttentionCard
        attention={{
          notice: { kind: 'needs-plan' },
          aiNotes: null,
          planName: null,
          dismissalKey: null,
          promo: null,
        }}
      />,
    )

    expect(html).toContain('Generar mi plan')
    expect(html).not.toContain('Quitar aviso')
    expect(html).not.toContain('Quitar promoción')
  })
})
