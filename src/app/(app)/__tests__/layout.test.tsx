import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

async function renderLayout(communityEnabled: boolean): Promise<string> {
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: vi.fn(() => Promise.resolve({
      profile: { language: 'es', timezone: 'America/Havana' },
    })),
  }))
  vi.doMock('@/lib/features/community', () => ({
    isCommunityEnabled: vi.fn(() => communityEnabled),
  }))
  vi.doMock('@/lib/i18n', () => ({ normalizeLanguage: () => 'es' }))
  vi.doMock('@/components/navigation/appNavigation', () => ({
    getPersonalNavItems: () => [],
  }))
  vi.doMock('@/components/i18n/I18nProvider', () => ({
    I18nProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  }))
  vi.doMock('@/components/navigation/AppShell', () => ({
    AppShell: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  }))
  vi.doMock('@/components/native/AndroidBackHandler', () => ({
    AndroidBackHandler: () => <i data-native-init="android-back" />,
  }))
  vi.doMock('@/components/native/ProductPushNotificationsInit', () => ({
    ProductPushNotificationsInit: () => <i data-native-init="product-push" />,
  }))
  vi.doMock('@/components/native/SocialPushNotificationsInit', () => ({
    SocialPushNotificationsInit: () => <i data-native-init="social-push" />,
  }))
  vi.doMock('@/components/profile/TimezoneSync', () => ({
    TimezoneSync: () => <i data-native-init="timezone" />,
  }))

  const AppLayout = (await import('../layout')).default
  return renderToStaticMarkup(await AppLayout({ children: <main>content</main> }))
}

describe('AppLayout push initialization', () => {
  it('mounts product push but not social push when Community is disabled', async () => {
    const html = await renderLayout(false)

    expect(html).toContain('data-native-init="product-push"')
    expect(html).not.toContain('data-native-init="social-push"')
  })

  it('adds social push without replacing product push when Community is enabled', async () => {
    const html = await renderLayout(true)

    expect(html).toContain('data-native-init="product-push"')
    expect(html).toContain('data-native-init="social-push"')
  })
})
