import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

type LayoutRenderOptions = {
  communityEnabled: boolean
  cookie?: string
  trainerAccess?: { granted: boolean; reason?: string }
}

type AppShellProps = {
  navItems: unknown
  workspace?: string
}

async function renderLayout({
  communityEnabled,
  cookie,
  trainerAccess = { granted: false, reason: 'missing_profile' },
}: LayoutRenderOptions): Promise<{ html: string; appShellProps: AppShellProps | null }> {
  let appShellProps: AppShellProps | null = null
  const personalNavItems = [{ href: '/dashboard', label: 'Inicio' }]
  const coachNavItems = [{ href: '/coach', label: 'Resumen' }]
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: vi.fn(() => Promise.resolve({
      profile: { language: 'es', timezone: 'America/Havana' },
      user: { id: 'layout-test-user' },
      supabase: {},
    })),
  }))
  vi.doMock('@/lib/coaching/access', () => ({
    getTrainerAccess: vi.fn(() => Promise.resolve(trainerAccess)),
  }))
  vi.doMock('next/headers', () => ({
    cookies: () => ({ get: () => (cookie ? { value: cookie } : undefined) }),
  }))
  vi.doMock('@/lib/features/community', () => ({
    isCommunityEnabled: vi.fn(() => communityEnabled),
  }))
  vi.doMock('@/lib/i18n', () => ({ normalizeLanguage: () => 'es' }))
  vi.doMock('@/components/navigation/appNavigation', () => ({
    getPersonalNavItems: () => personalNavItems,
    getCoachNavItems: () => coachNavItems,
  }))
  vi.doMock('@/components/i18n/I18nProvider', () => ({
    I18nProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  }))
  vi.doMock('@/components/navigation/AppShell', () => ({
    AppShell: ({ children, navItems, workspace }: { children: ReactNode } & AppShellProps) => {
      appShellProps = { navItems, workspace }
      return <section>{children}</section>
    },
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
  return {
    html: renderToStaticMarkup(await AppLayout({ children: <main>content</main> })),
    appShellProps,
  }
}

describe('AppLayout push initialization', () => {
  it('mounts product push but not social push when Community is disabled', async () => {
    const { html } = await renderLayout({ communityEnabled: false })

    expect(html).toContain('data-native-init="product-push"')
    expect(html).not.toContain('data-native-init="social-push"')
  })

  it('adds social push without replacing product push when Community is enabled', async () => {
    const { html } = await renderLayout({ communityEnabled: true })

    expect(html).toContain('data-native-init="product-push"')
    expect(html).toContain('data-native-init="social-push"')
  })

  it('keeps the approved coach cookie and passes the coach navigation plus selector workspace to AppShell', async () => {
    const { appShellProps } = await renderLayout({
      communityEnabled: false,
      cookie: 'coach',
      trainerAccess: { granted: true },
    })

    expect(appShellProps).toEqual({
      navItems: [{ href: '/coach', label: 'Resumen' }],
      workspace: 'coach',
    })
  })

  it('falls back from an obsolete coach cookie to personal navigation and does not expose the selector', async () => {
    const { appShellProps } = await renderLayout({
      communityEnabled: false,
      cookie: 'coach',
      trainerAccess: { granted: false, reason: 'inactive' },
    })

    expect(appShellProps).toEqual({
      navItems: [{ href: '/dashboard', label: 'Inicio' }],
      workspace: undefined,
    })
  })

  it('normalizes an invalid cookie to personal while retaining the active trainer selector', async () => {
    const { appShellProps } = await renderLayout({
      communityEnabled: false,
      cookie: 'invalid',
      trainerAccess: { granted: true },
    })

    expect(appShellProps).toEqual({
      navItems: [{ href: '/dashboard', label: 'Inicio' }],
      workspace: 'personal',
    })
  })
})
