import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({ pathname: '/dashboard' }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/actions/workspace', () => ({ setWorkspace: vi.fn() }))
vi.mock('@/app/(auth)/actions', () => ({ signOut: vi.fn() }))
vi.mock('@/components/branding/VekiraLogo', () => ({ VekiraLogo: () => <i>logo</i> }))
vi.mock('@/components/i18n/I18nProvider', () => ({ useI18n: () => ({ t: (value: string) => value }) }))
vi.mock('../PendingLink', () => ({
  PendingLink: ({
    href,
    children,
    showSpinner: _showSpinner,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; showSpinner?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import type { AccountWorkspaceModel } from '../AccountWorkspaceContext'
import { AccountWorkspaceProvider } from '../AccountWorkspaceProvider'
import { DesktopSidebar } from '../DesktopSidebar'

const PERSONAL_MODEL: AccountWorkspaceModel = {
  account: { name: 'Ana', email: 'ana@example.com', avatarUrl: null },
  trainerAccess: { granted: true },
  preferredWorkspace: 'personal',
  personalNavItems: [
    { href: '/dashboard', label: 'Inicio' },
    { href: '/plan', label: 'Plan' },
    { href: '/entrenar', label: 'Entrenar' },
    { href: '/progress', label: 'Progreso' },
    { href: '/trainers', label: 'Entrenadores' },
  ],
  coachNavItems: [
    { href: '/coach', label: 'Resumen' },
    { href: '/coach/clients', label: 'Clientes' },
    { href: '/coach/programs', label: 'Rutinas' },
    { href: '/coach/requests', label: 'Solicitudes' },
  ],
}
const COACH_MODEL: AccountWorkspaceModel = {
  ...PERSONAL_MODEL,
  preferredWorkspace: 'coach',
}

function renderSidebar(model: AccountWorkspaceModel, pathname: string) {
  mocks.pathname = pathname
  return renderToStaticMarkup(
    <AccountWorkspaceProvider model={model}>
      <DesktopSidebar />
    </AccountWorkspaceProvider>,
  )
}

describe('DesktopSidebar workspace destinations', () => {
  it('renders only coach destinations and keeps the account block outside navigation', () => {
    const html = renderSidebar(COACH_MODEL, '/coach')

    expect(html).toContain('href="/coach"')
    expect((html.match(/aria-current="page"/g) ?? [])).toHaveLength(1)
    expect(html).not.toContain('href="/coach/profile"')
    expect(html).not.toContain('href="/coach/services"')
    expect(html).not.toContain('data-workspace-switcher')
    const navEnd = html.indexOf('</nav>')
    const accountTrigger = html.indexOf('aria-label="Abrir cuenta y espacios"')
    expect(navEnd).toBeGreaterThan(-1)
    expect(accountTrigger).toBeGreaterThan(navEnd)
  })

  it('renders only the personal workspace when trainer access is inactive', () => {
    const PERSONAL_ONLY_MODEL: AccountWorkspaceModel = {
      ...PERSONAL_MODEL,
      trainerAccess: { granted: false, reason: 'inactive' },
      preferredWorkspace: 'personal',
    }
    const personalHtml = renderSidebar(PERSONAL_ONLY_MODEL, '/dashboard')

    expect(personalHtml).toContain('href="/dashboard"')
    expect(personalHtml).not.toContain('href="/coach"')
    expect(personalHtml).toContain('Espacio activo: Personal')
    expect(personalHtml).not.toContain('data-workspace-switcher')
  })
})
