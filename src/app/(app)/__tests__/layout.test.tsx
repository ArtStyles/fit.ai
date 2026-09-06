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
  accountWorkspace: {
    account: { name: string | null; email: string; avatarUrl: string | null }
    trainerAccess: { granted: boolean; reason?: string }
    preferredWorkspace: string
    personalNavItems: unknown
    coachNavItems: unknown
  }
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
      profile: {
        language: 'es',
        timezone: 'America/Havana',
        full_name: 'Ana Pérez',
        avatar_url: '/avatar.jpg',
      },
      user: { id: 'layout-test-user', email: 'ana@example.com' },
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
    AppShell: ({ children, accountWorkspace }: { children: ReactNode } & AppShellProps) => {
      appShellProps = { accountWorkspace }
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

  it('keeps the approved coach cookie and passes the complete account workspace model to AppShell', async () => {
    const { appShellProps } = await renderLayout({
      communityEnabled: false,
      cookie: 'coach',
      trainerAccess: { granted: true },
    })

    expect(appShellProps).toEqual({
      accountWorkspace: {
        account: {
          name: 'Ana Pérez',
          email: 'ana@example.com',
          avatarUrl: '/avatar.jpg',
        },
        trainerAccess: { granted: true },
        preferredWorkspace: 'coach',
        personalNavItems: [{ href: '/dashboard', label: 'Inicio' }],
        coachNavItems: [{ href: '/coach', label: 'Resumen' }],
      },
    })
  })

  it('falls back from an obsolete coach cookie while preserving the inactive access reason', async () => {
    const { appShellProps } = await renderLayout({
      communityEnabled: false,
      cookie: 'coach',
      trainerAccess: { granted: false, reason: 'inactive' },
    })

    expect(appShellProps).toEqual({
      accountWorkspace: {
        account: {
          name: 'Ana Pérez',
          email: 'ana@example.com',
          avatarUrl: '/avatar.jpg',
        },
        trainerAccess: { granted: false, reason: 'inactive' },
        preferredWorkspace: 'personal',
        personalNavItems: [{ href: '/dashboard', label: 'Inicio' }],
        coachNavItems: [{ href: '/coach', label: 'Resumen' }],
      },
    })
  })

  it('normalizes an invalid cookie to personal while retaining active trainer access', async () => {
    const { appShellProps } = await renderLayout({
      communityEnabled: false,
      cookie: 'invalid',
      trainerAccess: { granted: true },
    })

    expect(appShellProps).toEqual({
      accountWorkspace: {
        account: {
          name: 'Ana Pérez',
          email: 'ana@example.com',
          avatarUrl: '/avatar.jpg',
        },
        trainerAccess: { granted: true },
        preferredWorkspace: 'personal',
        personalNavItems: [{ href: '/dashboard', label: 'Inicio' }],
        coachNavItems: [{ href: '/coach', label: 'Resumen' }],
      },
    })
  })
})
