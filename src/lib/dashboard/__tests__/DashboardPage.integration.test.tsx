import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

async function renderDashboardWithCommunityDisabled() {
  const isCommunityEnabled = vi.fn(() => false)
  const query: any = {
    select: () => query,
    eq: () => query,
    is: () => query,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: null, count: 0, error: null }),
  }
  const supabase = {
    rpc: vi.fn(async () => ({
      data: {
        active_plan: null,
        workouts: [],
        recent_logs: [],
        week_logs: [],
        week_volume_kg: 0,
        has_completed_sessions: false,
      },
      error: null,
    })),
    from: vi.fn(() => query),
  }

  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: vi.fn(async () => ({
      supabase,
      user: { id: 'dashboard-user', email: 'ana@example.com' },
      profile: {
        full_name: 'Ana',
        username: 'ana',
        language: 'es',
        timezone: 'America/Havana',
        avatar_url: null,
        last_check_in_at: null,
      },
    })),
  }))
  vi.doMock('@/lib/features/community', () => ({ isCommunityEnabled }))
  vi.doMock('@/components/profile/AvatarUploader', () => ({
    AvatarUploader: () => <span data-testid="avatar" />,
  }))
  vi.doMock('@/components/navigation/FixedTopBar', () => ({
    FixedTopBar: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  }))
  vi.doMock('@/components/i18n/I18nProvider', () => ({
    useI18n: () => ({ t: (source: string) => source }),
  }))
  vi.doMock('@/components/dashboard/DashboardNotice', () => ({
    DashboardMainNotice: () => null,
    DashboardNotice: () => null,
  }))
  vi.doMock('@/components/dashboard/DashboardWeekJourney', () => ({
    DashboardWeekJourney: () => <div data-testid="journey" />,
  }))

  const DashboardPage = (await import('../../../app/(app)/dashboard/page')).default
  return { html: renderToStaticMarkup(await DashboardPage()), isCommunityEnabled }
}

describe('DashboardPage profile navigation', () => {
  it('withholds the social profile link while retaining settings when Community is disabled', async () => {
    const { html, isCommunityEnabled } = await renderDashboardWithCommunityDisabled()

    expect(isCommunityEnabled).toHaveBeenCalledTimes(1)
    expect(html).not.toContain('href="/u/ana"')
    expect(html).toContain('href="/settings"')
    expect(html).toContain('aria-label="Abrir ajustes"')
  })
})
