import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/app/actions/notifications', () => ({ updateProductNotificationPreferences: async () => ({ ok: true }) }))
vi.mock('@/components/feedback/ToastProvider', () => ({ useToast: () => ({ showToast: () => {} }) }))
vi.mock('@/components/i18n/I18nProvider', () => ({ useI18n: () => ({ language: 'es', t: (text: string) => text }) }))
import { ProductNotificationPreferences } from '../ProductNotificationPreferences'

describe('APK push capability presentation', () => {
  it('disables only the push control and explains its unavailable capability', () => {
    const html = renderToStaticMarkup(<ProductNotificationPreferences initialPreferences={{ professionalEnabled: true, pushEnabled: true }} pushAvailable={false} />)
    const switches = Array.from(html.matchAll(/<button[^>]*role="switch"[^>]*>/g)).map(match => match[0])
    expect(switches).toHaveLength(2)
    expect(switches[0]).not.toContain('disabled=""')
    expect(switches[1]).toContain('disabled=""')
    expect(switches[1]).toContain('aria-checked="false"')
    expect(html).toContain('Esta versión de Android no tiene configuradas las notificaciones push.')
  })
})
