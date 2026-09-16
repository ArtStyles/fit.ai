import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const out = new URL('../../.artifacts/route-a11y-regression/', import.meta.url)
const results = [], blockedExternalRequests = [], pageErrors = []
const paths = [
  '/login', '/register', '/recover-password', '/dashboard', '/plan', '/entrenar', '/registrar', '/progress', '/history',
  '/calendario', '/medidas', '/exercises', '/plans/generate', '/settings', '/settings/perfil',
  '/settings/datos', '/settings/entrenamiento', '/settings/notificaciones', '/settings/musica',
  '/settings/idioma', '/settings/cuenta', '/settings/almacenamiento', '/companion', '/fitness-card',
  '/trainers', '/es/privacidad', '/es/terminos', '/en/privacy', '/en/terms',
]
const browser = await chromium.launch({ headless: true })
let current = null
await mkdir(out, { recursive: true })
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.origin === origin) return route.continue()
    blockedExternalRequests.push({ route: current, origin: url.origin, path: url.pathname })
    return route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => pageErrors.push({ route: current, message: error.message }))
  await page.goto(`${origin}/login`)
  const state = await newTestAccount({ linked: false })
  Object.assign(state.tables.profiles[0], {
    full_name: 'Auditoría local', onboarding_done: true, language: 'es', timezone: 'America/Havana',
    readiness_status: 'cleared', date_of_birth: '1996-09-10', age: 30, gender: 'male', weight_kg: 75,
    height_cm: 175, last_check_in_at: new Date().toISOString(), cardio_preferences: ['walking'],
  })
  await installAccountFixture(page, state)
  const initial = await storedAccountSnapshot(page)
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    for (const path of paths) {
      current = `${width}:${path}`
      const entry = { width, requestedPath: path, errors: [], violations: [] }
      const startError = pageErrors.length
      try {
        await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => document.body.innerText.trim().length > 30 && !document.body.innerText.includes('Un momento…'), null, { timeout: 15000 })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(180)
        Object.assign(entry, await page.evaluate(() => ({
          actualPath: location.pathname + location.search,
          language: document.documentElement.lang,
          overflowPx: document.documentElement.scrollWidth - innerWidth,
          headings: Array.from(document.querySelectorAll('h1,h2')).map(node => node.textContent?.trim()),
          alerts: Array.from(document.querySelectorAll('[role="alert"]')).map(node => node.textContent?.trim()).filter(Boolean),
          errorScreen: /No se pudo abrir esta pantalla|No se pudo mostrar esta pantalla/.test(document.body.innerText),
        })))
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
        entry.violations = audit.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, help: v.help, helpUrl: v.helpUrl, nodes: v.nodes.map(n => ({ target: n.target, html: n.html, summary: n.failureSummary })) }))
        entry.incomplete = audit.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length }))
        entry.errors = pageErrors.slice(startError)
        if (entry.overflowPx > 1 || entry.errorScreen || entry.errors.length || entry.violations.length) {
          const file = `a11y-${width}-${path.replaceAll('/', '-').replace(/^-/, '')}.png`
          await page.screenshot({ path: new URL(file, out).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), fullPage: true })
          entry.screenshot = file
        }
      } catch (reason) { entry.failure = reason.message; entry.errors = pageErrors.slice(startError) }
      results.push(entry)
      await writeFile(new URL('route-a11y-audit.json', out), JSON.stringify({ status: 'running', results, pageErrors, blockedExternalRequests }, null, 2))
      console.log(JSON.stringify({ width, path, actualPath: entry.actualPath, overflowPx: entry.overflowPx, violations: entry.violations.map(v => `${v.id}:${v.nodes.length}`), failure: entry.failure }))
    }
  }
  const final = await storedAccountSnapshot(page)
  const report = {
    status: 'completed', auditedAt: new Date().toISOString(), origin, viewports: [360, 390, 768],
    method: 'Compiled local preview, one Chromium page, reduced motion, synthetic offline account, all external requests aborted; initial rendered states only; no native device or remote account verification.',
    fixtures: { accountId: state.accountId, exerciseCount: state.tables.exercises.length, emptyPlanAndHistory: true, accountUnchanged: JSON.stringify(initial) === JSON.stringify(final) },
    summary: { scenarios: results.length, routeFailures: results.filter(r => r.failure).length, errorScreens: results.filter(r => r.errorScreen).length, horizontalOverflows: results.filter(r => r.overflowPx > 1).length, pagesWithAxeViolations: results.filter(r => r.violations.length).length, violationIds: [...new Set(results.flatMap(r => r.violations.map(v => v.id)))], pageErrors: pageErrors.length },
    results, pageErrors, blockedExternalRequests,
  }
  await writeFile(new URL('route-a11y-audit.json', out), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report.summary))
  process.exitCode = report.summary.routeFailures || report.summary.errorScreens || report.summary.horizontalOverflows || report.summary.pagesWithAxeViolations || report.summary.pageErrors || !report.fixtures.accountUnchanged ? 1 : 0
} finally { await browser.close() }
