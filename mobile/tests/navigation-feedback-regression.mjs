import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, expect } from '@playwright/test'

const repoRoot = process.cwd()
const require = createRequire(import.meta.url)
const viteEntry = createRequire(require.resolve('vitest')).resolve('vite')
const { build } = await import(pathToFileURL(createRequire(viteEntry).resolve('esbuild')).href)
const artifacts = path.join(repoRoot, '.artifacts/navigation-feedback')
await mkdir(artifacts, { recursive: true })
const [nativePlugin, nativeActivity, feedbackClient] = await Promise.all([
  readFile(path.join(repoRoot, 'android/app/src/main/java/com/fitai/app/NavigationFeedbackPlugin.java'), 'utf8'),
  readFile(path.join(repoRoot, 'android/app/src/main/java/com/fitai/app/MainActivity.java'), 'utf8'),
  readFile(path.join(repoRoot, 'src/lib/native/navigationFeedback.ts'), 'utf8'),
])
const pluginName = nativePlugin.match(/@CapacitorPlugin\(name\s*=\s*"([^"]+)"\)/)?.[1]
const clientPluginName = feedbackClient.match(/registerPlugin[\s\S]*?\(\s*['"]([^'"]+)['"]\s*\)/)?.[1]
assert.equal(pluginName, 'VekiraNavigationFeedback', 'Java plugin must use the shipped bridge name')
assert.equal(clientPluginName, pluginName, 'JavaScript and Java must register the same bridge')
assert.match(nativePlugin, /@PluginMethod\s+public void tap\(PluginCall call\)/)
assert.match(nativeActivity, /registerPlugin\(NavigationFeedbackPlugin\.class\)/)
console.log('PASS Java plugin annotation, tap method, activity registration and JavaScript bridge agree')

// Only platform and routing boundaries are replaced. BottomNav, PendingLink,
// navigationTapFeedback and the existing haptics implementation stay real.
const mocks = new Map([
  ['@capacitor/core', `
    export const Capacitor = {
      getPlatform: () => window.__feedback.platform,
      isNativePlatform: () => window.__feedback.platform !== 'web',
      isPluginAvailable: name => name === 'VekiraNavigationFeedback' && window.__feedback.available,
    }
    export const registerPlugin = name => ({ tap: () => {
      window.__feedback.taps.push(name)
      if (window.__feedback.tapMode === 'reject') return Promise.reject(new Error('Native feedback unavailable'))
      if (window.__feedback.tapMode === 'pending') return new Promise((resolve, reject) => {
        window.__resolveTap = resolve
        window.__rejectTap = reject
      })
      return Promise.resolve()
    } })
  `],
  ['@capacitor/haptics', `
    export const ImpactStyle = { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }
    export const NotificationType = { Success: 'SUCCESS' }
    export const Haptics = {
      impact: async options => { window.__feedback.impacts.push(options.style) },
      notification: async () => {},
      vibrate: async () => {},
    }
  `],
  ['next/navigation', `
    import { useSyncExternalStore } from 'react'
    const subscribe = callback => {
      window.addEventListener('fixture:navigation', callback)
      return () => window.removeEventListener('fixture:navigation', callback)
    }
    export const usePathname = () => useSyncExternalStore(subscribe, () => location.pathname)
  `],
  ['next/link', `
    import { forwardRef } from 'react'
    const Link = forwardRef(function Link({ href, children, onClick, ...props }, ref) {
      return <a {...props} ref={ref} href={String(href)} onClick={event => {
        onClick?.(event)
        if (event.defaultPrevented) return
        event.preventDefault()
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        history.pushState({}, '', String(href))
        window.__feedback.routes.push(location.pathname)
        window.dispatchEvent(new Event('fixture:navigation'))
      }}>{children}</a>
    })
    export default Link
  `],
  ['@/app/actions/authorizeSession', `
    export const releaseSessionAuthorization = async () => ({ success: true })
    export const verifySessionBackupOwner = async () => ({ success: false })
  `],
])

const bundle = await build({
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
  jsx: 'automatic',
  alias: { '@': path.join(repoRoot, 'src') },
  stdin: {
    loader: 'tsx',
    resolveDir: repoRoot,
    contents: `
      import { createRoot } from 'react-dom/client'
      import { BottomNav } from './src/components/navigation/BottomNav'
      import { AccountWorkspaceContext } from './src/components/navigation/AccountWorkspaceContext'
      import { getPersonalNavItems } from './src/components/navigation/appNavigation'
      import { I18nProvider } from './src/components/i18n/I18nProvider'
      const context = {
        account: { id: 'feedback-user', name: 'Ana', email: 'ana@example.invalid', avatarUrl: null },
        trainerAccess: { granted: false, reason: 'missing_profile' },
        preferredWorkspace: 'personal', presentedWorkspace: 'personal', immersiveRoute: false,
        personalNavItems: [], coachNavItems: [], navItems: getPersonalNavItems({ communityEnabled: false }),
        pendingWorkspace: null, error: null, clearError: () => {},
        changeWorkspace: async () => ({ status: 'cancelled' }), signOutAccount: async () => {},
      }
      createRoot(document.getElementById('root')).render(
        <I18nProvider language="es" syncDocumentLanguage={false}>
          <AccountWorkspaceContext.Provider value={context}>
            <main onClickCapture={event => { if (window.__feedback.preventClick) event.preventDefault() }}>
              <BottomNav />
            </main>
          </AccountWorkspaceContext.Provider>
        </I18nProvider>
      )
    `,
  },
  plugins: [{
    name: 'navigation-feedback-boundaries',
    setup(api) {
      api.onResolve({ filter: /.*/ }, args => mocks.has(args.path)
        ? { path: args.path, namespace: 'feedback-boundary' } : null)
      api.onLoad({ filter: /.*/, namespace: 'feedback-boundary' }, args => ({
        contents: mocks.get(args.path), loader: 'tsx', resolveDir: repoRoot,
      }))
    },
  }],
})
const javascript = bundle.outputFiles[0].text
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
body { margin: 0; background: #101014; color: white; font-family: sans-serif; }
nav > div { display: flex; gap: 12px; padding: 16px; }
nav a { display: flex; min-width: 52px; min-height: 60px; flex-direction: column; align-items: center; color: white; }
nav svg { width: 24px; height: 24px; } nav span { display: block; }
</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`
const server = createServer((request, response) => {
  const script = request.url === '/fixture.js'
  response.writeHead(200, { 'content-type': script ? 'text/javascript' : 'text/html' })
  response.end(script ? javascript : html)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
let browser
const passed = []

async function scenario(name, config, run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const pageErrors = []
  const page = await context.newPage()
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(overrides => {
    window.__feedback = {
      platform: 'android', available: true, tapMode: 'resolve', preventClick: false,
      taps: [], impacts: [], vibrations: [], routes: [], navigationStarts: 0, rejections: [],
      ...overrides,
    }
    Object.defineProperty(navigator, 'vibrate', { value: pattern => {
      window.__feedback.vibrations.push(pattern)
      return true
    } })
    addEventListener('fitai:navigation-start', () => { window.__feedback.navigationStarts += 1 })
    addEventListener('unhandledrejection', event => { window.__feedback.rejections.push(String(event.reason)) })
  }, config)
  try {
    await page.goto(`${origin}/dashboard`)
    await expect(page.getByRole('link', { name: 'Inicio', exact: true })).toBeVisible()
    await run(page)
    const state = await page.evaluate(() => window.__feedback)
    assert.deepEqual(pageErrors, [])
    assert.deepEqual(state.rejections, [])
    passed.push({ name, taps: state.taps.length, impacts: state.impacts, vibrations: state.vibrations, routes: state.routes })
    console.log(`PASS ${name}`)
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {})
    throw error
  } finally {
    await context.close()
  }
}

const feedbackState = page => page.evaluate(() => window.__feedback)
const waitForRateLimit = page => page.waitForTimeout(160)
async function expectTaps(page, count) {
  await expect.poll(async () => (await feedbackState(page)).taps.length).toBe(count)
}

try {
  browser = await chromium.launch({ headless: true })
  await scenario('Android pointer, active tab and keyboard each provide one native tap', {}, async page => {
    const plan = page.getByRole('link', { name: 'Plan', exact: true })
    await plan.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 })
    assert.equal((await feedbackState(page)).taps.length, 0, 'pointerdown alone must not trigger feedback')
    await plan.click()
    await expect(page).toHaveURL(`${origin}/plan`)
    await expectTaps(page, 1)
    await waitForRateLimit(page)
    assert.equal((await feedbackState(page)).taps.length, 1, 'route change must not trigger feedback again')
    await expect(plan).toHaveAttribute('aria-current', 'page')
    await plan.click()
    await expectTaps(page, 2)
    await waitForRateLimit(page)
    await page.getByRole('link', { name: 'Progreso', exact: true }).press('Enter')
    await expect(page).toHaveURL(`${origin}/progress`)
    await expectTaps(page, 3)
    const state = await feedbackState(page)
    assert.deepEqual(state.taps, ['VekiraNavigationFeedback', 'VekiraNavigationFeedback', 'VekiraNavigationFeedback'])
    assert.deepEqual(state.impacts, [])
    assert.deepEqual(state.vibrations, [])
  })

  await scenario('Pending and rejected Android feedback never block navigation or invoke impact fallback', { tapMode: 'pending' }, async page => {
    await page.getByRole('link', { name: 'Plan', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/plan`)
    await expectTaps(page, 1)
    await page.evaluate(() => window.__rejectTap(new Error('Native feedback unavailable')))
    await waitForRateLimit(page)
    const state = await feedbackState(page)
    assert.deepEqual(state.impacts, [])
    assert.deepEqual(state.vibrations, [])
    await expect(page.getByRole('link', { name: 'Plan', exact: true })).not.toHaveAttribute('aria-busy', 'true')
  })

  await scenario('Android without the native plugin remains silent and navigable', { available: false }, async page => {
    await page.getByRole('link', { name: 'Plan', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/plan`)
    const state = await feedbackState(page)
    assert.deepEqual(state.taps, [])
    assert.deepEqual(state.impacts, [])
    assert.deepEqual(state.vibrations, [])
  })

  await scenario('Modified, cancelled and non-primary clicks do not produce feedback', {}, async page => {
    const plan = page.getByRole('link', { name: 'Plan', exact: true })
    for (const key of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) {
      await plan.dispatchEvent('click', { button: 0, [key]: true })
    }
    for (const button of [1, 2]) await plan.dispatchEvent('click', { button })
    await page.evaluate(() => { window.__feedback.preventClick = true })
    await plan.click()
    assert.deepEqual((await feedbackState(page)).taps, [])
    assert.deepEqual((await feedbackState(page)).routes, [])
    await page.evaluate(() => { window.__feedback.preventClick = false })
    await plan.click()
    await expectTaps(page, 1)
    await expect(page).toHaveURL(`${origin}/plan`)
  })

  await scenario('Rapid duplicate activations are throttled without delaying routes', {}, async page => {
    await page.evaluate(() => {
      for (const href of ['/plan', '/progress']) {
        document.querySelector(`a[href="${href}"]`).click()
      }
    })
    await expect(page).toHaveURL(`${origin}/progress`)
    await expectTaps(page, 1)
    await waitForRateLimit(page)
    await page.getByRole('link', { name: 'Entrenadores', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/trainers`)
    await expectTaps(page, 2)
  })

  await scenario('Web keeps the established light vibration feedback', { platform: 'web' }, async page => {
    await page.getByRole('link', { name: 'Plan', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/plan`)
    const state = await feedbackState(page)
    assert.deepEqual(state.taps, [])
    assert.deepEqual(state.impacts, [])
    assert.deepEqual(state.vibrations, [20])
  })

  await scenario('iOS keeps the established light haptic impact', { platform: 'ios' }, async page => {
    await page.getByRole('link', { name: 'Plan', exact: true }).click()
    await expect(page).toHaveURL(`${origin}/plan`)
    const state = await feedbackState(page)
    assert.deepEqual(state.taps, [])
    assert.deepEqual(state.impacts, ['LIGHT'])
    assert.deepEqual(state.vibrations, [])
  })
  await writeFile(path.join(artifacts, 'report.json'), JSON.stringify({ passed: true, scenarios: passed }, null, 2))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
