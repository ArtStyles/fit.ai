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
})
