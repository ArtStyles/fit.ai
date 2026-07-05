import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('technical SEO routes', () => {
  it('allows crawlers to read every route and advertises the sitemap', async () => {
    const { default: robots } = await import('../robots')

    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'http://localhost:3000/sitemap.xml',
    })
  })

  it('lists the root and localized home pages with reciprocal alternates', async () => {
    const { default: sitemap } = await import('../sitemap')

    expect(sitemap()).toEqual([
      { url: 'http://localhost:3000/' },
      {
        url: 'http://localhost:3000/es',
        alternates: {
          languages: {
            'es-419': 'http://localhost:3000/es',
            en: 'http://localhost:3000/en',
          },
        },
      },
      {
        url: 'http://localhost:3000/en',
        alternates: {
          languages: {
            'es-419': 'http://localhost:3000/es',
            en: 'http://localhost:3000/en',
          },
        },
      },
    ])
  })
})
