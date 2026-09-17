import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import LocalizedHome from '@/app/[locale]/page'

describe('public Android download landing', () => {
  it.each(['es', 'en'] as const)('%s directs visitors to download the app without web authentication', async locale => {
    const html = renderToStaticMarkup(await LocalizedHome({ params: Promise.resolve({ locale }) }))
    const links = Array.from(html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>/g), match => match[1])

    expect(links.some(href => /\/(?:login|register)(?:[/?#]|$)/.test(href))).toBe(false)
    expect(links.filter(href => href === `/${locale}#descargar`)).toHaveLength(3)
    expect(html).toContain('id="descargar"')
    expect(html).toMatch(/<a\b(?=[^>]*\bhref="[^"]+\.apk")(?=[^>]*\bdownload(?:="[^"]*")?)[^>]*>/)
    expect(links).toContain(`/${locale}#ayuda`)
    expect(html).toContain('id="ayuda"')
    expect(links.some(href => href.startsWith('mailto:'))).toBe(true)
  })
})
