import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import type { AccountWorkspaceModel } from '../AccountWorkspaceContext'
import { AccountWorkspaceProvider } from '../AccountWorkspaceProvider'
import { FixedTopBar } from '../FixedTopBar'
import { PageTopBar } from '../PageTopBar'

const mocks = vi.hoisted(() => ({ pathname: '/notifications' }))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/actions/workspace', () => ({ setWorkspace: vi.fn() }))
vi.mock('@/app/(auth)/actions', () => ({ signOut: vi.fn() }))

const model: AccountWorkspaceModel = {
  account: { name: 'Ana Pérez', email: 'ana@example.com', avatarUrl: null },
  trainerAccess: { granted: true },
  preferredWorkspace: 'personal',
  personalNavItems: [{ href: '/dashboard', label: 'Inicio' }],
  coachNavItems: [{ href: '/coach', label: 'Resumen' }],
}

afterEach(() => {
  mocks.pathname = '/notifications'
})

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <I18nProvider language="es" syncDocumentLanguage={false}>
      <AccountWorkspaceProvider model={model}>{node}</AccountWorkspaceProvider>
    </I18nProvider>,
  )
}

describe('FixedTopBar account slot', () => {
  it('adds one default compact account trigger inside the provider', () => {
    const html = render(<FixedTopBar>Título</FixedTopBar>)
    expect((html.match(/aria-label="Abrir cuenta y espacios"/g) ?? [])).toHaveLength(1)
  })

  it.each(['/session/workout-1', '/plans/generate', '/feed/new'])(
    'suppresses the default account trigger on immersive route %s',
    pathname => {
      mocks.pathname = pathname
      expect(render(<FixedTopBar>Cargando</FixedTopBar>))
        .not.toContain('Abrir cuenta y espacios')
    },
  )

  it('renders neither default nor geometry outside the provider', () => {
    const html = renderToStaticMarkup(<FixedTopBar>Título</FixedTopBar>)
    expect(html).not.toContain('Abrir cuenta y espacios')
    expect(html).not.toContain('data-account-workspace-slot')
  })

  it('supports hidden and caller-owned custom slots', () => {
    expect(render(<FixedTopBar accountSlot="hidden">Sesión</FixedTopBar>))
      .not.toContain('Abrir cuenta y espacios')
    const custom = render(
      <FixedTopBar accountSlot="custom">
        <button aria-label="Abrir cuenta y espacios">Cuenta</button>
      </FixedTopBar>,
    )
    expect((custom.match(/aria-label="Abrir cuenta y espacios"/g) ?? [])).toHaveLength(1)
  })

  it('keeps caller actions and the default trigger in one right region', () => {
    const html = render(
      <FixedTopBar actions={<button aria-label="Buscar">Buscar</button>}>
        <h1>Comunidad</h1>
      </FixedTopBar>,
    )
    expect((html.match(/data-fixed-topbar-actions/g) ?? [])).toHaveLength(1)
    expect(html).toContain('aria-label="Buscar"')
    expect((html.match(/aria-label="Abrir cuenta y espacios"/g) ?? [])).toHaveLength(1)
  })

  it('keeps PageTopBar right actions next to one account trigger', () => {
    const html = render(
      <PageTopBar
        title="Notificaciones"
        right={<button aria-label="Filtrar notificaciones">Filtrar</button>}
      />,
    )
    expect(html).toContain('aria-label="Filtrar notificaciones"')
    expect((html.match(/aria-label="Abrir cuenta y espacios"/g) ?? [])).toHaveLength(1)
    expect(html).toContain('data-page-topbar-actions')
  })

  it('lets PageTopBar hide the account while preserving caller actions', () => {
    const html = render(
      <PageTopBar
        accountSlot="hidden"
        title="Generar plan"
        right={<button aria-label="Ayuda">Ayuda</button>}
      />,
    )
    expect(html).toContain('aria-label="Ayuda"')
    expect(html).not.toContain('Abrir cuenta y espacios')
  })
})
