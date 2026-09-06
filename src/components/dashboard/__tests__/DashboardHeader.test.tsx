import { createElement, type ComponentProps, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import type { AccountWorkspaceModel } from '@/components/navigation/AccountWorkspaceContext'
import { AccountWorkspaceProvider } from '@/components/navigation/AccountWorkspaceProvider'
import { DashboardHeader } from '../DashboardHeader'

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/actions/workspace', () => ({ setWorkspace: vi.fn() }))
vi.mock('@/app/(auth)/actions', () => ({ signOut: vi.fn() }))

vi.mock('@/components/navigation/FixedTopBar', () => ({
  FixedTopBar: ({ children, accountSlot: _accountSlot, initialHeight: _initialHeight, contentClassName: _contentClassName }: {
    children: ReactNode
    accountSlot?: string
    initialHeight?: number
    contentClassName?: string
  }) => <header>{children}</header>,
}))

const model: AccountWorkspaceModel = {
  account: { name: 'Ana PÃ©rez', email: 'ana@example.com', avatarUrl: null },
  trainerAccess: { granted: true },
  preferredWorkspace: 'personal',
  personalNavItems: [{ href: '/dashboard', label: 'Inicio' }],
  coachNavItems: [{ href: '/coach', label: 'Resumen' }],
}

const baseProps: ComponentProps<typeof DashboardHeader> = {
  greeting: 'Buenos días',
  firstName: 'Ana',
  dateLabel: 'sábado, 15 de agosto',
  profileHref: null,
}

function renderHeader(overrides: Partial<ComponentProps<typeof DashboardHeader>> = {}) {
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      language: 'es',
      syncDocumentLanguage: false,
      children: createElement(AccountWorkspaceProvider, {
        model,
        children: createElement(DashboardHeader, { ...baseProps, ...overrides }),
      }),
    }),
  )
}

describe('DashboardHeader account access', () => {
  it('uses the large avatar as account trigger and keeps notifications', () => {
    const html = renderHeader()

    expect(html).toContain('aria-label="Abrir cuenta y espacios"')
    expect(html).toContain('href="/notifications"')
    expect(html).toContain('aria-label="Abrir notificaciones"')
    expect(html).not.toContain('href="/settings"')
    expect(html).not.toContain('aria-label="Abrir ajustes"')
    expect(html).not.toContain('type="file"')
    expect(html).not.toContain('data-avatar-uploader')
  })

  it('routes the notice control to the dedicated page without expanding content in the header', () => {
    const html = renderHeader({ hasNotificationAttention: true })

    expect(html).toContain('href="/notifications"')
    expect(html).toContain('aria-label="Abrir notificaciones"')
    expect(html).toMatch(/<a(?![^>]*aria-expanded=)[^>]*href="\/notifications"/)
    expect(html).not.toContain('dashboard-notice-hub')
    expect(html).not.toContain('href="/settings"')
    expect(html).not.toContain('aria-label="Abrir ajustes"')
  })

  it('renders the user name as text unless an available social profile href is supplied', () => {
    const unavailable = renderHeader({ profileHref: null })
    const available = renderHeader({ profileHref: '/u/ana' })

    expect(unavailable).not.toContain('href="/u/ana"')
    expect(available).toContain('href="/u/ana"')
  })
})
