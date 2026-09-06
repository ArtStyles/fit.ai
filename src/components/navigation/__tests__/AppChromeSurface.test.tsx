import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ pathname: '/dashboard' }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/actions/workspace', () => ({ setWorkspace: vi.fn() }))
vi.mock('@/app/(auth)/actions', () => ({ signOut: vi.fn() }))
vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (value: string) => value }),
}))
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
import { BottomNav } from '../BottomNav'
import { FixedTopBar } from '../FixedTopBar'

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

function renderChrome(model: AccountWorkspaceModel, pathname = '/dashboard') {
  mocks.pathname = pathname
  return renderToStaticMarkup(
    <AccountWorkspaceProvider model={model}>
      <BottomNav />
    </AccountWorkspaceProvider>,
  )
}

describe('persistent app chrome surface', () => {
  it('keeps both persistent bars on the shared lighter surface', () => {
    const expectedSurface = 'bg-[hsl(var(--surface-1)/0.95)]'
    const topBar = renderToStaticMarkup(<FixedTopBar>Vekira</FixedTopBar>)
    const bottomBar = renderChrome(PERSONAL_MODEL)

    expect(topBar).toContain(expectedSurface)
    expect(bottomBar).toContain(expectedSurface)
  })

  it('renders only five personal destinations and never a workspace tab', () => {
    const html = renderChrome(PERSONAL_MODEL)
    expect((html.match(/data-bottom-nav-item=/g) ?? [])).toHaveLength(5)
    expect(html).not.toContain('data-workspace-switcher')
    expect(html).not.toContain('Cambiar al espacio')
    expect(html).toContain('grid-cols-5')
  })

  it('renders exactly four coach destinations', () => {
    const html = renderChrome(COACH_MODEL, '/coach')
    expect((html.match(/data-bottom-nav-item=/g) ?? [])).toHaveLength(4)
    expect(html).toContain('grid-cols-4')
  })
})
