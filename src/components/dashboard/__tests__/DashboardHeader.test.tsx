import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { DashboardHeader } from '../DashboardHeader'

vi.mock('@/components/profile/AvatarUploader', () => ({
  AvatarUploader: () => <span data-testid="avatar" />,
}))

vi.mock('@/components/navigation/FixedTopBar', () => ({
  FixedTopBar: ({ children }: { children: ReactNode }) => <header>{children}</header>,
}))

vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (source: string) => source }),
}))

const baseProps: ComponentProps<typeof DashboardHeader> = {
  greeting: 'Buenos días',
  firstName: 'Ana',
  dateLabel: 'sábado, 15 de agosto',
  avatarUrl: null,
  profileHref: null,
}

function renderHeader(overrides: Partial<ComponentProps<typeof DashboardHeader>> = {}) {
  return renderToStaticMarkup(<DashboardHeader {...baseProps} {...overrides} />)
}

describe('DashboardHeader settings access', () => {
  it('always exposes 44px settings and notification links from the personal Home header', () => {
    const html = renderHeader()

    expect(html).toContain('href="/settings"')
    expect(html).toContain('aria-label="Abrir ajustes"')
    expect(html).toMatch(/<a[^>]+h-11[^>]+w-11[^>]+href="\/settings"/)
    expect(html).toContain('href="/notifications"')
    expect(html).toContain('aria-label="Abrir notificaciones"')
    expect(html).toMatch(/<a[^>]+h-11[^>]+w-11[^>]+href="\/notifications"/)
  })

  it('routes the notice control to the dedicated page without expanding content in the header', () => {
    const html = renderHeader({ hasNotificationAttention: true })

    expect(html).toContain('href="/settings"')
    expect(html).toContain('href="/notifications"')
    expect(html).toContain('aria-label="Abrir notificaciones"')
    expect(html).not.toContain('aria-expanded=')
    expect(html).not.toContain('dashboard-notice-hub')
  })

  it('renders the user name as text unless an available social profile href is supplied', () => {
    const unavailable = renderHeader({ profileHref: null })
    const available = renderHeader({ profileHref: '/u/ana' })

    expect(unavailable).not.toContain('href="/u/ana"')
    expect(available).toContain('href="/u/ana"')
  })
})
