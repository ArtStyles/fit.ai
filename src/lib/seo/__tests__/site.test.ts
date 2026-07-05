import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('site URL helpers', () => {
  it('uses the local application URL when no public URL is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined)
    const { SITE_URL } = await import('../site')

    expect(SITE_URL.toString()).toBe('http://localhost:3000/')
  })

  it('resolves root-relative paths against the configured site URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://vekira.example')
    const { absoluteUrl } = await import('../site')

    expect(absoluteUrl('/sitemap.xml')).toBe(
      'https://vekira.example/sitemap.xml',
    )
  })
})
