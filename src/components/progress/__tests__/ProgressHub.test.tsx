import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { ProgressHub } from '../ProgressHub'

// PendingLink requires the Next browser router; destinations remain real anchors here.
vi.mock('@/components/navigation/PendingLink', () => ({ PendingLink: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }))

function renderProgress(language: 'es' | 'en' = 'es') {
  return renderToStaticMarkup(<I18nProvider language={language} timeZone="UTC"><ProgressHub todayStr="2026-09-11" locale={language} sessions={[]} days={[]} records={[]} measurements={[]} exercisePoints={[]} /></I18nProvider>)
}

describe('ProgressHub initial layout', () => {
  it('opens the overview with an accessible period control, keeping performance and body content out of the initial view', () => {
    const html = renderProgress()
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Resumen</)
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-label="Seleccionar periodo"')
    expect(html).toContain('Tu actividad muscular')
    expect(html).not.toContain('Últimas medidas')
    expect(html).not.toContain('Ejercicios del periodo')
    expect(html).toContain('Completa una sesión')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('Infinity')
  })

  it('keeps secondary evidence collapsed and places the muscle map first', () => {
    const html = renderProgress('en')
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Training load</)
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Weekly consistency</)
    expect(html.indexOf('Your muscle activity')).toBeLessThan(html.indexOf('Training load'))
    expect(html).not.toMatch(/<details[^>]* open/)
  })
})
