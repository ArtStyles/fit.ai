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
  noticeLabel: 'Notificaciones',
}

function renderHeader(overrides: Partial<ComponentProps<typeof DashboardHeader>> = {}) {
  return renderToStaticMarkup(<DashboardHeader {...baseProps} {...overrides} />)
}

describe('DashboardHeader settings access', () => {
  it('always exposes a 44px settings link from the personal Home header', () => {
    const html = renderHeader()

    expect(html).toContain('href="/settings"')
    expect(html).toContain('aria-label="Abrir ajustes"')
    expect(html).toMatch(/<a[^>]+h-11[^>]+w-11[^>]+href="\/settings"/)
  })

  it('keeps the settings link beside the notice control', () => {
    const html = renderHeader({ noticeContent: <span>Aviso</span> })

    expect(html).toContain('href="/settings"')
    expect(html).toContain('aria-label="Abrir avisos"')
    expect([
      /<a[^>]+href="\/settings"[^>]*>[\s\S]*?<\/a><button[^>]+aria-label="Abrir avisos"[^>]*>/,
      /<button[^>]+aria-label="Abrir avisos"[^>]*>[\s\S]*?<\/button><a[^>]+href="\/settings"[^>]*>/,
    ].some(pattern => pattern.test(html))).toBe(true)
  })

  it('renders the user name as text unless an available social profile href is supplied', () => {
    const unavailable = renderHeader({ profileHref: null })
    const available = renderHeader({ profileHref: '/u/ana' })

    expect(unavailable).not.toContain('href="/u/ana"')
    expect(available).toContain('href="/u/ana"')
  })
})
