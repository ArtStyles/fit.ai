import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { translate } from '@/lib/i18n'

vi.mock('../PendingLink', () => ({
  PendingLink: ({
    href,
    children,
    showSpinner: _showSpinner,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string
    showSpinner?: boolean
  }) => <a href={href} {...props}>{children}</a>,
}))

import { AccountWorkspaceMenuBody } from '../AccountWorkspaceMenu'
import { AccountWorkspaceTrigger } from '../AccountWorkspaceTrigger'

const account = {
  name: 'Ana Pérez con un nombre profesional especialmente largo',
  email: 'ana.entrenamiento@example.com',
  avatarUrl: null,
}

function renderBody(
  workspace: 'personal' | 'coach',
  canUseCoach: boolean,
  error: string | null = null,
  pendingWorkspace: 'personal' | 'coach' | null = null,
) {
  return renderToStaticMarkup(
    <I18nProvider language="es" syncDocumentLanguage={false}>
      <AccountWorkspaceMenuBody
        account={account}
        workspace={workspace}
        canUseCoach={canUseCoach}
        pendingWorkspace={pendingWorkspace}
        error={error}
        onWorkspaceChange={vi.fn()}
        onSignOut={vi.fn()}
      />
    </I18nProvider>,
  )
}

describe('AccountWorkspaceMenuBody', () => {
  it('shows only Personal and the personal profile without coach access', () => {
    const html = renderBody('personal', false)
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Personal')
    expect(html).not.toContain('>Entrenador<')
    expect(html).toContain('href="/settings/perfil"')
    expect(html).toContain('href="/coaching"')
    expect(html).not.toContain('href="/coach/profile"')
    expect(html).toContain('href="/settings"')
    expect(html).toContain('Cerrar sesión')
  })

  it('shows professional profile and services only in coach context', () => {
    const html = renderBody('coach', true)
    expect(html).toContain('>Entrenador<')
    expect(html).toContain('href="/coach/profile"')
    expect(html).toContain('href="/coach/services"')
    expect(html).not.toContain('href="/settings/perfil"')
    expect(html).not.toContain('href="/coaching"')
  })

  it('uses Radix menu items rather than nesting dialog controls in role=menu', () => {
    const source = readFileSync(new URL('../AccountWorkspaceMenu.tsx', import.meta.url), 'utf8')
    expect(source).toContain('<DropdownMenuRadioGroup')
    expect(source).toContain('<DropdownMenuRadioItem')
    expect(source).toContain('<DropdownMenuItem disabled={interactionLocked} asChild>')
    expect(source).toContain("presentation === 'menu'")
    expect(source).toContain("window.matchMedia('(min-width: 1024px)')")
    expect(source).toContain("sideOffset={surface === 'sidebar' ? 16 : 4}")
  })

  it('keeps headers and the menu free of transitive Server Action imports', () => {
    const menu = readFileSync(new URL('../AccountWorkspaceMenu.tsx', import.meta.url), 'utf8')
    const context = readFileSync(new URL('../AccountWorkspaceContext.tsx', import.meta.url), 'utf8')
    expect(menu).not.toContain('@/app/')
    expect(context).not.toContain('@/app/')
    expect(menu).toContain('context.signOutAccount()')
  })

  it('announces a recoverable action error in the shared body', () => {
    const html = renderBody('personal', true, 'El espacio solicitado no es válido.')
    expect(html).toContain('role="alert"')
    expect(html).toContain('El espacio solicitado no es válido.')
  })

  it('renders a touch-sized trigger without a file input', () => {
    const html = renderToStaticMarkup(
      <I18nProvider language="es" syncDocumentLanguage={false}>
        <AccountWorkspaceTrigger
          variant="compact"
          workspace="personal"
          name="Ana Pérez"
          avatarUrl={null}
          pending={false}
          data-radix-probe="forwarded"
        />
      </I18nProvider>,
    )
    expect(html).toContain('aria-label="Abrir cuenta y espacios"')
    expect(html).toMatch(/<button[^>]+h-11[^>]+w-11/)
    expect(html).toContain('data-radix-probe="forwarded"')
    expect(html).toContain('data-account-workspace-trigger')
    expect(html).toContain('data-account-workspace-avatar')
    expect(html).toContain('data-account-workspace-badge')
    const descriptionId = html.match(/aria-describedby="([^"]+)"/)?.[1]
    expect(descriptionId).toBeTruthy()
    expect(html).toContain(`id="${descriptionId}"`)
    expect(html).toContain('Espacio activo: Personal')
    expect(html).not.toContain('type="file"')
  })

  it('locks every navigation and sign-out action while a workspace change is pending', () => {
    for (const [html, hrefs] of [
      [renderBody('coach', true, null, 'personal'), ['/coach/profile', '/coach/services', '/settings']],
      [renderBody('personal', true, null, 'coach'), ['/settings/perfil', '/coaching', '/settings']],
    ] as const) {
      for (const href of hrefs) {
        const link = html.match(new RegExp(`<a[^>]+href="${href}"[^>]*>`))?.[0]
        expect(link).toContain('aria-disabled="true"')
        expect(link).toContain('tabindex="-1"')
      }
      const signOut = html.match(/<button[^>]+data-account-sign-out[^>]*>/)?.[0]
      expect(signOut).toContain('disabled=""')
    }
  })

  it('contains every new English label', () => {
    const labels = [
      ['Usuario', 'User'],
      ['Personal', 'Personal'],
      ['Entrenador', 'Coach'],
      ['Resumen', 'Overview'],
      ['Clientes', 'Clients'],
      ['Rutinas', 'Programs'],
      ['Entrenadores', 'Trainers'],
      ['Servicios', 'Services'],
      ['Abrir cuenta y espacios', 'Open account and workspaces'],
      ['Cuenta y espacios', 'Account and workspaces'],
      ['Selector de espacio', 'Workspace selector'],
      ['Espacio activo', 'Active workspace'],
      ['Enlaces de cuenta', 'Account links'],
      ['Perfil personal', 'Personal profile'],
      ['Mi acompañamiento', 'My coaching'],
      ['Perfil profesional', 'Professional profile'],
      ['El espacio solicitado no es válido.', 'The requested workspace is invalid.'],
      ['El espacio de entrenador ya no está disponible.', 'The coach workspace is no longer available.'],
      ['No se pudo cambiar de espacio. Inténtalo nuevamente.', 'Could not switch workspaces. Try again.'],
    ] as const
    for (const [source, expected] of labels) {
      expect(translate('en', source)).toBe(expected)
    }
    expect(translate('en', 'Cambiando al espacio {workspace}…', {
      workspace: 'Coach',
    })).toBe('Switching to the Coach workspace…')
  })
})
