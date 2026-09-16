import { describe, expect, it } from 'vitest'
import { LEGAL_COPY } from '@/app/[locale]/_legal/legalContent'
import { platformLegalCopy as webLegal } from '@/lib/legal/platformLegalCopy'
import { platformLegalCopy } from './legal-content'

describe('Android privacy describes actual local and connected behavior', () => {
  it.each(['es', 'en'] as const)('preserves web/terms and scopes Android privacy in %s', locale => {
    const original = structuredClone(LEGAL_COPY[locale].privacy)
    expect(webLegal(locale, 'privacy', LEGAL_COPY[locale].privacy)).toBe(LEGAL_COPY[locale].privacy)
    expect(platformLegalCopy(locale, 'terms', LEGAL_COPY[locale].terms)).toBe(LEGAL_COPY[locale].terms)
    const mobile = platformLegalCopy(locale, 'privacy', LEGAL_COPY[locale].privacy)
    const text = JSON.stringify(mobile)
    expect(text).toContain('Android'); expect(text).toContain('Supabase')
    expect(text).toMatch(locale === 'es' ? /sin cifrar/ : /unencrypted/)
    expect(text).toMatch(locale === 'es' ? /reglas locales/ : /local rules/)
    expect(text).toMatch(locale === 'es' ? /acceso a notificaciones/ : /notification access/)
    expect(text).not.toContain(LEGAL_COPY[locale].privacy.sections[2].paragraphs![0])
    expect(LEGAL_COPY[locale].privacy).toEqual(original)
  })
})
