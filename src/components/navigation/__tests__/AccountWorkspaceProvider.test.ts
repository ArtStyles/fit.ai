import { createRequire } from 'node:module'
import path from 'node:path'
import { chromium, expect as pwExpect, type Browser, type Page } from '@playwright/test'
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

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/app/actions/workspace', () => ({ setWorkspace: vi.fn() }))
vi.mock('@/app/(auth)/actions', () => ({ signOut: vi.fn() }))

import { executeWorkspaceTransition } from '../AccountWorkspaceProvider'

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

type ProviderBrowserHarness = Window & typeof globalThis & {
  __actionCalls: string[]
  __actionMode: 'success' | 'deferred' | 'invalid'
  __resolveActions: Array<(result: {
    ok: true
    workspace: 'coach'
    destination: '/coach'
  }) => void>
  __routerCalls: string[]
  __transitionOutcomes?: Promise<unknown[]>
  __workspaceContext?: {
    changeWorkspace: (target: 'personal' | 'coach') => Promise<unknown>
  }
  __workspaceGuard?: {
    request: (intent: { workspace: 'coach'; destination: '/coach' }) => boolean
    commit: (intent: { workspace: 'coach'; destination: '/coach' }) => void
    intentEvent: string
    commitEvent: string
  }
  __workspaceReady?: boolean
}

async function loadEsbuild(): Promise<Esbuild> {
  const require = createRequire(import.meta.url)
  const vitestEntry = require.resolve('vitest')
  const viteEntry = createRequire(vitestEntry).resolve('vite')
  const esbuildEntry = createRequire(viteEntry).resolve('esbuild')
  return import(esbuildEntry) as unknown as Promise<Esbuild>
}

async function buildProviderBrowserFixture(): Promise<string> {
  const { build } = await loadEsbuild()
  const providerPath = path.join(
    process.cwd(),
    'src/components/navigation/AccountWorkspaceProvider.tsx',
  )
  const contextPath = path.join(
    process.cwd(),
    'src/components/navigation/AccountWorkspaceContext.tsx',
  )
  const guardPath = path.join(
    process.cwd(),
    'src/components/navigation/WorkspaceNavigationGuard.ts',
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
        import { AccountWorkspaceProvider } from ${JSON.stringify(providerPath)}
        import { useAccountWorkspace } from ${JSON.stringify(contextPath)}
        import {
          WORKSPACE_NAVIGATION_COMMIT,
          WORKSPACE_NAVIGATION_INTENT,
          commitWorkspaceNavigation,
          requestWorkspaceNavigation,
        } from ${JSON.stringify(guardPath)}

        window.__actionCalls = []
        window.__actionMode = 'success'
        window.__resolveActions = []
        window.__routerCalls = []
        window.__pathname = '/dashboard'
        window.__router = {
          replace: destination => window.__routerCalls.push('replace:' + destination),
          refresh: () => window.__routerCalls.push('refresh'),
        }
        window.__workspaceGuard = {
          request: requestWorkspaceNavigation,
          commit: commitWorkspaceNavigation,
          intentEvent: WORKSPACE_NAVIGATION_INTENT,
          commitEvent: WORKSPACE_NAVIGATION_COMMIT,
        }

        function Probe() {
          const value = useAccountWorkspace()
          window.__workspaceContext = value
          return (
            <output
              data-testid="workspace-state"
              data-presented={value.presentedWorkspace}
              data-pending={value.pendingWorkspace ?? ''}
              data-error={value.error ?? ''}
            />
          )
        }

        const root = createRoot(document.getElementById('root'))
        root.render(
          <AccountWorkspaceProvider model={{
            account: { name: 'Ada', email: 'ada@example.com', avatarUrl: null },
            trainerAccess: { granted: true },
            preferredWorkspace: 'personal',
            personalNavItems: [{ href: '/dashboard', label: 'Inicio' }],
            coachNavItems: [{ href: '/coach', label: 'Resumen' }],
          }}>
            <Probe />
          </AccountWorkspaceProvider>
        )
        requestAnimationFrame(() => { window.__workspaceReady = true })
      `,
    },
    plugins: [{
      name: 'account-workspace-provider-browser-fixture-mocks',
      setup(buildApi: FixtureBuildApi) {
        const mocks = new Map<string, string>([
          ['next/navigation', `
            export const usePathname = () => window.__pathname
            export const useRouter = () => window.__router
          `],
          ['@/app/actions/workspace', `
            export const setWorkspace = formData => {
              const target = formData.get('workspace')
              window.__actionCalls.push(target)
              if (window.__actionMode === 'deferred') {
                return new Promise(resolve => { window.__resolveActions.push(resolve) })
              }
              if (window.__actionMode === 'invalid') {
                return Promise.resolve({
                  ok: false,
                  code: 'invalid_workspace',
                  error: 'El espacio solicitado no es válido.',
                })
              }
              return Promise.resolve({
                ok: true,
                workspace: target,
                destination: target === 'coach' ? '/coach' : '/dashboard',
              })
            }
          `],
          ['@/app/(auth)/actions', `
            export const signOut = async () => {}
          `],
        ])

        buildApi.onResolve({ filter: /.*/ }, args => {
          if (mocks.has(args.path)) {
            return { path: args.path, namespace: 'account-workspace-provider-mock' }
          }
          return null
        })
        buildApi.onLoad(
          { filter: /.*/, namespace: 'account-workspace-provider-mock' },
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

describe('executeWorkspaceTransition', () => {
  it('requests permission, exposes pending, commits, replaces, and refreshes in order', async () => {
    const order: string[] = []
    const outcome = await executeWorkspaceTransition('coach', 'personal', {
      requestIntent: target => {
        order.push('intent:' + target)
        return true
      },
      commitIntent: target => { order.push('commit:' + target) },
      action: async formData => {
        order.push('action:' + formData.get('workspace'))
        return { ok: true, workspace: 'coach', destination: '/coach' }
      },
      replace: destination => { order.push('replace:' + destination) },
      refresh: () => { order.push('refresh') },
      setPending: target => { order.push('pending:' + String(target)) },
    })

    expect(outcome).toEqual({ status: 'navigating' })
    expect(order).toEqual([
      'intent:coach',
      'pending:coach',
      'action:coach',
      'commit:coach',
      'replace:/coach',
      'refresh',
      'pending:null',
    ])
  })

  it('cancels before the server action', async () => {
    const action = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => false,
      commitIntent: vi.fn(),
      action,
      replace: vi.fn(),
      refresh: vi.fn(),
      setPending: vi.fn(),
    })).resolves.toEqual({ status: 'cancelled' })
    expect(action).not.toHaveBeenCalled()
  })

  it('keeps errors recoverable and refreshes revoked access', async () => {
    const commitIntent = vi.fn()
    const replace = vi.fn()
    const refresh = vi.fn()
    const setPending = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent,
      action: async () => ({
        ok: false,
        code: 'coach_unavailable',
        error: 'El espacio de entrenador ya no está disponible.',
      }),
      replace,
      refresh,
      setPending,
    })).resolves.toEqual({
      status: 'failed',
      code: 'coach_unavailable',
      error: 'El espacio de entrenador ya no está disponible.',
    })
    expect(commitIntent).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(refresh).toHaveBeenCalledOnce()
    expect(setPending.mock.calls).toEqual([['coach'], [null]])
  })

  it('surfaces invalid input without commit, navigation, or refresh', async () => {
    const commitIntent = vi.fn()
    const replace = vi.fn()
    const refresh = vi.fn()
    const setPending = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent,
      action: async () => ({
        ok: false,
        code: 'invalid_workspace',
        error: 'El espacio solicitado no es válido.',
      }),
      replace,
      refresh,
      setPending,
    })).resolves.toEqual({
      status: 'failed',
      code: 'invalid_workspace',
      error: 'El espacio solicitado no es válido.',
    })
    expect(commitIntent).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(setPending.mock.calls).toEqual([['coach'], [null]])
  })

  it('does not commit or replace when the action fails unexpectedly', async () => {
    const commitIntent = vi.fn()
    const replace = vi.fn()
    const setPending = vi.fn()

    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent,
      action: async () => ({
        ok: false,
        code: 'unexpected',
        error: 'No se pudo cambiar de espacio. IntÃ©ntalo nuevamente.',
      }),
      replace,
      refresh: vi.fn(),
      setPending,
    })).resolves.toEqual({
      status: 'failed',
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. IntÃ©ntalo nuevamente.',
    })

    expect(commitIntent).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(setPending.mock.calls).toEqual([['coach'], [null]])
  })

  it('turns a rejected network call into an unexpected failure', async () => {
    const commitIntent = vi.fn()
    const replace = vi.fn()
    const refresh = vi.fn()
    const setPending = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent,
      action: async () => { throw new Error('offline') },
      replace,
      refresh,
      setPending,
    })).resolves.toEqual({
      status: 'failed',
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    })
    expect(commitIntent).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(setPending.mock.calls).toEqual([['coach'], [null]])
  })

  it('treats an absent action result as navigation already handled by Next', async () => {
    const commitIntent = vi.fn()
    const replace = vi.fn()
    const refresh = vi.fn()
    const setPending = vi.fn()
    await expect(executeWorkspaceTransition('coach', 'personal', {
      requestIntent: () => true,
      commitIntent,
      action: async () => undefined,
      replace,
      refresh,
      setPending,
    })).resolves.toEqual({ status: 'redirecting' })
    expect(commitIntent).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(setPending.mock.calls).toEqual([['coach'], [null]])
  })
})

describe('AccountWorkspaceProvider browser integration', () => {
  let browser: Browser
  let bundle = ''
  let page: Page

  beforeAll(async () => {
    bundle = await buildProviderBrowserFixture()
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  beforeEach(async () => {
    page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await page.setContent('<main><div id="root"></div></main>')
    await page.addScriptTag({ content: bundle })
    await page.waitForFunction(() => Boolean((window as ProviderBrowserHarness).__workspaceReady))
  })

  afterEach(async () => {
    await page?.close()
  })

  afterAll(async () => {
    await browser?.close()
  })

  it('cancels the presented workspace without invoking the action or router', async () => {
    const result = await page.evaluate(async () => {
      const harness = window as ProviderBrowserHarness
      const outcome = await harness.__workspaceContext?.changeWorkspace('personal')
      return {
        outcome,
        actionCalls: harness.__actionCalls,
        routerCalls: harness.__routerCalls,
      }
    })

    expect(result).toEqual({
      outcome: { status: 'cancelled' },
      actionCalls: [],
      routerCalls: [],
    })
    await pwExpect(page.getByTestId('workspace-state')).toHaveAttribute('data-pending', '')
  })

  it('blocks a duplicate synchronously while wiring pending, action, replace, and refresh', async () => {
    await page.evaluate(() => {
      const harness = window as ProviderBrowserHarness
      harness.__actionMode = 'deferred'
      const first = harness.__workspaceContext!.changeWorkspace('coach')
      const second = harness.__workspaceContext!.changeWorkspace('coach')
      harness.__transitionOutcomes = Promise.all([first, second])
    })

    await pwExpect(page.getByTestId('workspace-state')).toHaveAttribute('data-pending', 'coach')
    expect(await page.evaluate(() => (window as ProviderBrowserHarness).__actionCalls)).toEqual(['coach'])

    await page.evaluate(() => {
      for (const resolve of (window as ProviderBrowserHarness).__resolveActions) {
        resolve({ ok: true, workspace: 'coach', destination: '/coach' })
      }
    })
    const outcomes = await page.evaluate(async () => {
      return (window as ProviderBrowserHarness).__transitionOutcomes
    })

    expect(outcomes).toEqual([
      { status: 'navigating' },
      { status: 'cancelled' },
    ])
    expect(await page.evaluate(() => (window as ProviderBrowserHarness).__routerCalls)).toEqual([
      'replace:/coach',
      'refresh',
    ])
    await pwExpect(page.getByTestId('workspace-state')).toHaveAttribute('data-pending', '')
  })

  it('populates a recoverable error and clears it when the next transition starts', async () => {
    const failed = await page.evaluate(async () => {
      const harness = window as ProviderBrowserHarness
      harness.__actionMode = 'invalid'
      return harness.__workspaceContext?.changeWorkspace('coach')
    })

    expect(failed).toEqual({
      status: 'failed',
      code: 'invalid_workspace',
      error: 'El espacio solicitado no es válido.',
    })
    await pwExpect(page.getByTestId('workspace-state')).toHaveAttribute(
      'data-error',
      'El espacio solicitado no es válido.',
    )

    await page.evaluate(() => {
      const harness = window as ProviderBrowserHarness
      harness.__actionMode = 'deferred'
      harness.__transitionOutcomes = Promise.all([
        harness.__workspaceContext!.changeWorkspace('coach'),
      ])
    })
    await pwExpect(page.getByTestId('workspace-state')).toHaveAttribute('data-error', '')
    await pwExpect(page.getByTestId('workspace-state')).toHaveAttribute('data-pending', 'coach')

    await page.evaluate(() => {
      for (const resolve of (window as ProviderBrowserHarness).__resolveActions) {
        resolve({ ok: true, workspace: 'coach', destination: '/coach' })
      }
    })
    await page.evaluate(async () => (window as ProviderBrowserHarness).__transitionOutcomes)
    await pwExpect(page.getByTestId('workspace-state')).toHaveAttribute('data-pending', '')
  })

  it('dispatches cancelable intent and observable commit events with canonical detail', async () => {
    const result = await page.evaluate(() => {
      const harness = window as ProviderBrowserHarness
      const guard = harness.__workspaceGuard!
      const events: Array<{
        type: string
        cancelable: boolean
        detail: unknown
      }> = []
      window.addEventListener(guard.intentEvent, event => {
        const customEvent = event as CustomEvent
        events.push({
          type: customEvent.type,
          cancelable: customEvent.cancelable,
          detail: customEvent.detail,
        })
        event.preventDefault()
      }, { once: true })
      window.addEventListener(guard.commitEvent, event => {
        const customEvent = event as CustomEvent
        events.push({
          type: customEvent.type,
          cancelable: customEvent.cancelable,
          detail: customEvent.detail,
        })
      }, { once: true })

      const intent = { workspace: 'coach' as const, destination: '/coach' as const }
      const allowed = guard.request(intent)
      guard.commit(intent)
      return { allowed, events }
    })

    expect(result).toEqual({
      allowed: false,
      events: [
        {
          type: 'vekira:workspace-navigation-intent',
          cancelable: true,
          detail: { workspace: 'coach', destination: '/coach' },
        },
        {
          type: 'vekira:workspace-navigation-commit',
          cancelable: false,
          detail: { workspace: 'coach', destination: '/coach' },
        },
      ],
    })
  })
})
