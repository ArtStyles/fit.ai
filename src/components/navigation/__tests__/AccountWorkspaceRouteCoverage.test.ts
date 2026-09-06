import { createRequire } from 'node:module'
import path from 'node:path'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { chromium, expect as pwExpect, type Browser, type Page } from '@playwright/test'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import type { AccountWorkspaceModel } from '../AccountWorkspaceContext'
import { AccountWorkspaceProvider } from '../AccountWorkspaceProvider'
import { FixedTopBar } from '../FixedTopBar'

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
type ChatHarness = Window & typeof globalThis & { __chatReady?: boolean }

const mocks = vi.hoisted(() => ({ pathname: '/notifications' }))
const originalCommunityEnabled = process.env.COMMUNITY_ENABLED

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  redirect: vi.fn(),
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

function renderInWorkspace(node: ReactNode) {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      {
        language: 'es',
        syncDocumentLanguage: false,
        children: createElement(AccountWorkspaceProvider, { model, children: node }),
      },
    ),
  )
}

async function renderFeedPage() {
  process.env.COMMUNITY_ENABLED = 'true'
  vi.resetModules()
  vi.doMock('@/app/actions/feed', () => ({
    getDiscoverFeed: vi.fn().mockResolvedValue({ posts: [], nextCursor: null }),
    getFollowingFeed: vi.fn().mockResolvedValue({ posts: [], nextCursor: null }),
  }))
  vi.doMock('@/app/actions/follows', () => ({
    getPendingRequestCount: vi.fn().mockResolvedValue(2),
  }))
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: vi.fn().mockResolvedValue({ profile: { language: 'es' } }),
  }))
  vi.doMock('@/lib/features/community', () => ({ isCommunityEnabled: () => true }))

  const FeedPage = (await import('@/app/(app)/feed/page')).default
  const { I18nProvider: FeedI18nProvider } = await import('@/components/i18n/I18nProvider')
  return renderToStaticMarkup(
    createElement(FeedI18nProvider, {
      language: 'es',
      syncDocumentLanguage: false,
      children: await FeedPage(),
    }),
  )
}

async function loadEsbuild(): Promise<Esbuild> {
  const require = createRequire(import.meta.url)
  const vitestEntry = require.resolve('vitest')
  const viteEntry = createRequire(vitestEntry).resolve('vite')
  const esbuildEntry = createRequire(viteEntry).resolve('esbuild')
  return import(esbuildEntry) as unknown as Promise<Esbuild>
}

async function buildChatBrowserFixture(): Promise<string> {
  const { build } = await loadEsbuild()
  const chatPath = path.join(process.cwd(), 'src/components/chat/ChatContainer.tsx')

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
        import { ChatContainer } from ${JSON.stringify(chatPath)}

        createRoot(document.getElementById('root')).render(
          <ChatContainer initialConversations={[]} />,
        )
        requestAnimationFrame(() => { window.__chatReady = true })
      `,
    },
    plugins: [{
      name: 'chat-topbar-browser-fixture-mocks',
      setup(buildApi: FixtureBuildApi) {
        const mocks = new Map<string, string>([
          ['next/navigation', `
            export const usePathname = () => '/chat'
            export const useRouter = () => ({ replace: () => {}, refresh: () => {} })
          `],
          ['@/app/actions/chat', `
            export const createConversation = async () => ({ success: false })
            export const sendMessage = async () => ({ success: false })
            export const getMessages = async () => []
            export const deleteConversation = async () => ({ success: true })
          `],
          ['@/components/i18n/I18nProvider', `
            export const useI18n = () => ({ language: 'es', timeZone: 'America/Havana', t: source => source })
          `],
          ['@/components/ui/dialog', `
            import React from 'react'
            export const Dialog = ({ open, children }) => React.createElement('div', { 'data-dialog-open': open ? 'true' : 'false' }, children)
            export const DialogContent = ({ children, ...props }) => React.createElement('div', props, children)
            export const DialogHeader = ({ children, ...props }) => React.createElement('div', props, children)
            export const DialogTitle = ({ children, ...props }) => React.createElement('h2', props, children)
          `],
          ['@/components/navigation/PendingLink', `
            import React from 'react'
            export const PendingLink = ({ href, children, showSpinner, ...props }) => React.createElement('a', { href, ...props }, children)
          `],
          ['@/components/navigation/AccountWorkspaceMenu', 'export const AccountWorkspaceMenu = () => null'],
          ['@/components/navigation/AccountWorkspaceContext', 'export const useOptionalAccountWorkspace = () => null'],
          ['@/components/ui', 'export const LongPressMenu = ({ children }) => children'],
          ['@/components/chat/ChatInputBar', 'export const ChatInputBar = () => null'],
          ['@/components/chat/MessageBubble', 'export const MessageBubble = () => null'],
        ])

        buildApi.onResolve({ filter: /.*/ }, args => {
          if (mocks.has(args.path)) return { path: args.path, namespace: 'chat-topbar-mock' }
          return null
        })
        buildApi.onLoad({ filter: /.*/, namespace: 'chat-topbar-mock' }, args => ({
          contents: mocks.get(args.path),
          loader: 'js',
          resolveDir: process.cwd(),
        }))
      },
    }],
  })

  return result.outputFiles[0]?.text ?? ''
}

let browser: Browser
let bundle = ''
let page: Page

beforeAll(async () => {
  bundle = await buildChatBrowserFixture()
  browser = await chromium.launch({ headless: true })
}, 30_000)

beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.setContent('<main><div id="root"></div></main>')
  await page.addScriptTag({ content: bundle })
  await page.waitForFunction(() => Boolean((window as ChatHarness).__chatReady))
})

afterEach(async () => {
  mocks.pathname = '/notifications'
  vi.doUnmock('@/app/actions/feed')
  vi.doUnmock('@/app/actions/follows')
  vi.doUnmock('@/lib/auth/server')
  vi.doUnmock('@/lib/features/community')
  vi.resetModules()
  if (originalCommunityEnabled === undefined) delete process.env.COMMUNITY_ENABLED
  else process.env.COMMUNITY_ENABLED = originalCommunityEnabled
  await page?.close()
})

afterAll(async () => {
  await browser?.close()
})

describe('top-bar account composition contract', () => {
  it('renders Feed destinations from the shared action region', async () => {
    const html = await renderFeedPage()

    // Mutation caught: remove FeedPage actions or move them outside FixedTopBar.actions.
    expect(html).toContain('data-fixed-topbar-actions')
    expect(html).toContain('href="/solicitudes"')
    expect(html).toContain('href="/buscar"')
    expect(html).toContain('href="/feed/new"')
  })

  it('keeps Chat destinations and the New handler in the real top-bar action region', async () => {
    const topBarActions = page.locator('[data-fixed-topbar-actions]')

    // Mutation caught: remove ChatContainer.actions or its setShowNewDialog(true) click handler.
    await pwExpect(page.locator('header').getByRole('link')).toHaveAttribute('href', '/dashboard')
    await pwExpect(topBarActions.getByRole('button', { name: 'Nueva' })).toBeVisible()
    await topBarActions.getByRole('button', { name: 'Nueva' }).click()
    await pwExpect(page.locator('[data-dialog-open]')).toHaveAttribute('data-dialog-open', 'true')
  })

  it.each(['/session/workout-1', '/plans/generate', '/feed/new'])(
    'suppresses the default account trigger on immersive route %s through the provider',
    pathname => {
      mocks.pathname = pathname

      // Mutation caught: remove FixedTopBar's immersiveRoute condition.
      expect(renderInWorkspace(createElement(FixedTopBar, null, 'Cargando')))
        .not.toContain('Abrir cuenta y espacios')
    },
  )
})
