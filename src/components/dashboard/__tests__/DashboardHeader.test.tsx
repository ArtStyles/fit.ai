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
  account: { id: 'account-a', name: 'Ana PÃ©rez', email: 'ana@example.com', avatarUrl: null },
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

function renderHeader(
  overrides: Partial<ComponentProps<typeof DashboardHeader>> = {},
  avatarUrl: string | null = null,
) {
  return renderToStaticMarkup(
    createElement(I18nProvider, {
      language: 'es',
      syncDocumentLanguage: false,
      children: createElement(AccountWorkspaceProvider, {
        model: { ...model, account: { ...model.account, avatarUrl } },
        children: createElement(DashboardHeader, { ...baseProps, ...overrides }),
      }),
    }),
  )
}

describe('DashboardHeader account access', () => {
  it('opens account access from the greeting text and keeps notifications', () => {
    const html = renderHeader()

    const accountButton = html.match(/<button[^>]*data-account-workspace-trigger[^>]*>[\s\S]*?<\/button>/)?.[0]
    expect(accountButton).toContain('aria-labelledby=')
    expect(accountButton).toContain('Abrir cuenta y espacios')
    expect(accountButton).not.toContain('aria-label=')
    expect(accountButton).toContain('Buenos días')
    expect(accountButton).toContain('Ana')
    expect(accountButton).toContain('sábado, 15 de agosto')
    expect(accountButton).not.toContain('data-account-workspace-avatar')
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

  it('keeps the account action on the name even when a social profile is available', () => {
    const unavailable = renderHeader({ profileHref: null })
    const available = renderHeader({ profileHref: '/u/ana' })

    expect(unavailable).not.toContain('href="/u/ana"')
    expect(available).not.toContain('href="/u/ana"')
    expect(available).toContain('Abrir cuenta y espacios')
  })

  it('gives the photo its own preview control only when an image exists', () => {
    const withoutPhoto = renderHeader()
    const withPhoto = renderHeader({}, '/profile-photo.jpg')

    expect(withoutPhoto).not.toContain('aria-label="Ampliar foto de perfil"')
    expect(withoutPhoto).toContain('aria-label="Foto de perfil"')
    expect(withPhoto).toContain('aria-label="Ampliar foto de perfil"')
  })
})
