import { createRequire } from 'node:module'
import path from 'node:path'
import { chromium, expect as pwExpect, type Browser, type Page } from '@playwright/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
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

type FixtureResolveArgs = { path: string }
type FixtureBuildApi = {
  onResolve: (
    options: { filter: RegExp },
    callback: (args: FixtureResolveArgs) => { path: string; namespace: string } | null,
  ) => void
  onLoad: (
    options: { filter: RegExp; namespace: string },
    callback: (args: FixtureResolveArgs) => {
      contents: string | undefined
      loader: 'js' | 'tsx'
      resolveDir: string
    },
  ) => void
}
type Esbuild = {
  build: (options: Record<string, unknown>) => Promise<{
    outputFiles: Array<{ text: string }>
  }>
}
type AccountMenuSurface = 'topbar' | 'dashboard' | 'sidebar'
type MenuBrowserHarness = Window & typeof globalThis & {
  __accountMenuReady?: boolean
  __mediaListenerAdds: number
  __mediaListenerRemoves: number
  __renderAccountMenu: (surface: AccountMenuSurface) => void
  __unmountAccountMenu: () => void
  __workspaceChanges: string[]
}

async function loadEsbuild(): Promise<Esbuild> {
  const require = createRequire(import.meta.url)
  const vitestEntry = require.resolve('vitest')
  const viteEntry = createRequire(vitestEntry).resolve('vite')
  const esbuildEntry = createRequire(viteEntry).resolve('esbuild')
  return import(esbuildEntry) as unknown as Promise<Esbuild>
}

async function buildMenuBrowserFixture(): Promise<string> {
  const { build } = await loadEsbuild()
  const menuPath = path.join(
    process.cwd(),
    'src/components/navigation/AccountWorkspaceMenu.tsx',
  )
  const contextPath = path.join(
    process.cwd(),
    'src/components/navigation/AccountWorkspaceContext.tsx',
  )
  const i18nPath = path.join(
    process.cwd(),
    'src/components/i18n/I18nProvider.tsx',
  )

  const result = await build({
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    jsx: 'automatic',
    stdin: {
      loader: 'tsx',
      resolveDir: process.cwd(),
      contents: `
        import React from 'react'
        import { createRoot } from 'react-dom/client'
        import { I18nProvider } from ${JSON.stringify(i18nPath)}
        import { AccountWorkspaceContext } from ${JSON.stringify(contextPath)}
        import { AccountWorkspaceMenu } from ${JSON.stringify(menuPath)}

        window.__workspaceChanges = []
        const root = createRoot(document.getElementById('root'))
        const context = {
          account: {
            name: 'Ana Pérez',
            email: 'ana@example.com',
            avatarUrl: null,
          },
          trainerAccess: { granted: true },
          preferredWorkspace: 'personal',
          personalNavItems: [],
          coachNavItems: [],
          presentedWorkspace: 'personal',
          immersiveRoute: false,
          navItems: [],
          pendingWorkspace: null,
          error: null,
          clearError: () => {},
          changeWorkspace: async target => {
            window.__workspaceChanges.push(target)
            return { status: 'navigating' }
          },
          signOutAccount: async () => {},
        }

        window.__renderAccountMenu = surface => {
          root.render(
            <I18nProvider language="es" syncDocumentLanguage={false}>
              <AccountWorkspaceContext.Provider value={context}>
                <AccountWorkspaceMenu surface={surface} />
              </AccountWorkspaceContext.Provider>
            </I18nProvider>,
          )
        }
        window.__unmountAccountMenu = () => root.unmount()
        window.__renderAccountMenu('sidebar')
        requestAnimationFrame(() => { window.__accountMenuReady = true })
      `,
    },
    plugins: [{
      name: 'account-workspace-menu-browser-fixture-mocks',
      setup(buildApi: FixtureBuildApi) {
        const mocks = new Map<string, string>([
          ['next/navigation', `
            export const usePathname = () => '/dashboard'
          `],
          ['next/link', `
            import React from 'react'
            const Link = React.forwardRef(function Link({ href, children, ...props }, ref) {
              return React.createElement('a', { ...props, href: String(href), ref }, children)
            })
            export default Link
          `],
        ])

        buildApi.onResolve({ filter: /.*/ }, args => {
          if (mocks.has(args.path)) {
            return { path: args.path, namespace: 'account-workspace-menu-mock' }
          }
          return null
        })
        buildApi.onLoad(
          { filter: /.*/, namespace: 'account-workspace-menu-mock' },
          args => ({
            contents: mocks.get(args.path),
            loader: 'js',
            resolveDir: process.cwd(),
          }),
        )
      },
    }],
  })

  return result.outputFiles[0]?.text ?? ''
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

  it('keeps the context boundary free of transitive Server Action imports', () => {
    const menu = readFileSync(new URL('../AccountWorkspaceMenu.tsx', import.meta.url), 'utf8')
    const context = readFileSync(new URL('../AccountWorkspaceContext.tsx', import.meta.url), 'utf8')
    expect(menu).not.toContain('@/app/')
    expect(context).not.toContain('@/app/')
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

describe('AccountWorkspaceMenu browser behavior', () => {
  let browser: Browser
  let bundle = ''
  let page: Page

  beforeAll(async () => {
    bundle = await buildMenuBrowserFixture()
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.setContent('<main><div id="root"></div></main>')
    await page.evaluate(() => {
      const harness = window as MenuBrowserHarness
      const realMatchMedia = window.matchMedia.bind(window)
      harness.__mediaListenerAdds = 0
      harness.__mediaListenerRemoves = 0
      window.matchMedia = query => {
        const mediaQuery = realMatchMedia(query)
        return new Proxy(mediaQuery, {
          get(target, property) {
            if (property === 'addEventListener') {
              return (...args: Parameters<MediaQueryList['addEventListener']>) => {
                if (query === '(min-width: 1024px)') harness.__mediaListenerAdds += 1
                return target.addEventListener(...args)
              }
            }
            if (property === 'removeEventListener') {
              return (...args: Parameters<MediaQueryList['removeEventListener']>) => {
                if (query === '(min-width: 1024px)') harness.__mediaListenerRemoves += 1
                return target.removeEventListener(...args)
              }
            }
            const value = Reflect.get(target, property, target)
            return typeof value === 'function' ? value.bind(target) : value
          },
        })
      }
    })
    await page.addScriptTag({ content: bundle })
    await page.waitForFunction(() => Boolean(
      (window as MenuBrowserHarness).__accountMenuReady,
    ))
  })

  afterEach(async () => {
    await page?.close()
  })

  afterAll(async () => {
    await browser?.close()
  })

  it('opens through the forwarded trigger and keeps desktop routes in Radix roving focus', async () => {
    const trigger = page.locator('[data-account-workspace-trigger]')
    await trigger.focus()
    await page.keyboard.press('Enter')

    const menu = page.getByRole('menu')
    const personal = page.getByRole('menuitemradio', { name: 'Personal' })
    const coach = page.getByRole('menuitemradio', { name: 'Entrenador' })
    await pwExpect(menu).toBeVisible()
    await pwExpect(trigger).toHaveAttribute('aria-expanded', 'true')
    await pwExpect(trigger).toHaveAttribute('data-state', 'open')
    await pwExpect(personal).toBeFocused()

    const personalProfile = page.getByRole('menuitem', { name: 'Perfil personal' })
    const coaching = page.getByRole('menuitem', { name: 'Mi acompañamiento' })
    const settings = page.getByRole('menuitem', { name: 'Ajustes' })
    await pwExpect(personalProfile).toHaveAttribute('href', '/settings/perfil')
    await pwExpect(coaching).toHaveAttribute('href', '/coaching')
    await pwExpect(settings).toHaveAttribute('href', '/settings')
    for (const route of [personalProfile, coaching, settings]) {
      await pwExpect(route).toHaveAttribute('tabindex', '-1')
    }

    await page.keyboard.press('ArrowDown')
    await pwExpect(coach).toBeFocused()
    await page.keyboard.press('Space')
    await pwExpect(menu).toHaveCount(0)
    expect(await page.evaluate(() => (
      window as MenuBrowserHarness
    ).__workspaceChanges)).toEqual(['coach'])
  }, 15_000)

  it('closes with Escape and returns focus to the forwarded trigger', async () => {
    const trigger = page.getByRole('button', { name: 'Abrir cuenta y espacios' })
    await trigger.focus()
    await page.keyboard.press('Space')
    await pwExpect(page.getByRole('menu')).toBeVisible()

    await page.keyboard.press('Escape')

    await pwExpect(page.getByRole('menu')).toHaveCount(0)
    await pwExpect(trigger).toBeFocused()
    await pwExpect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes a stale desktop portal at the 1024px breakpoint and removes its listener', async () => {
    await page.getByRole('button', { name: 'Abrir cuenta y espacios' }).click()
    await pwExpect(page.getByRole('menu')).toBeVisible()
    expect(await page.evaluate(() => (
      window as MenuBrowserHarness
    ).__mediaListenerAdds)).toBe(1)

    await page.setViewportSize({ width: 390, height: 844 })

    await pwExpect(page.getByRole('menu')).toHaveCount(0)
    await page.evaluate(() => (
      window as MenuBrowserHarness
    ).__unmountAccountMenu())
    expect(await page.evaluate(() => (
      window as MenuBrowserHarness
    ).__mediaListenerRemoves)).toBe(1)
  })

  it('closes a stale mobile dialog when crossing into the desktop breakpoint', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => (
      window as MenuBrowserHarness
    ).__renderAccountMenu('topbar'))
    const trigger = page.getByRole('button', { name: 'Abrir cuenta y espacios' })
    await trigger.focus()
    await page.keyboard.press('Enter')
    await pwExpect(page.getByRole('dialog', { name: 'Cuenta y espacios' })).toBeVisible()

    await page.setViewportSize({ width: 1024, height: 768 })

    await pwExpect(page.getByRole('dialog', { name: 'Cuenta y espacios' })).toHaveCount(0)
  })
})
