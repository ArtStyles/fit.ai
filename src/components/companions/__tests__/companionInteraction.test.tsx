import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, expect as pwExpect, type Browser, type Page } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { warmupFixture } from '@/test/browser/warmupFixture'
import type { CompanionResult, CompanionSnapshot } from '@/lib/companions/types'

type Harness = Window & typeof globalThis & {
  __renderCompanion: (value: CompanionResult<CompanionSnapshot>, mounted?: boolean, card?: boolean, viewerId?: string, language?: 'es' | 'en') => void
  __COMPANION_ACTIONS__: Record<string, (...args: unknown[]) => Promise<unknown>>
  __COMPANION_CALLS__: { name: string; args: unknown[] }[]
  __RESOLVE_COMPANION__?: () => void
}
const snapshot = (status: CompanionSnapshot['status'] = 'active'): CompanionSnapshot => ({
  viewerId: 'viewer-a', status,
  relationship: status === 'none' ? null : { id: 'relationship-a', other: { userId: 'partner-a', fullName: 'Marina Pérez', avatarUrl: null }, expiresAt: status === 'active' ? null : '2026-10-10T16:00:00Z' },
  self: { completedSessions: 1, goal: 3, weekStart: '2026-09-07', weekEnd: '2026-09-13', timeZone: 'America/Havana', updatedAt: '2026-09-10T12:00:00Z' },
  partner: status === 'active' ? { completedSessions: 2, goal: 3, weekStart: '2026-09-07', weekEnd: '2026-09-13', timeZone: 'America/Havana', updatedAt: '2026-09-10T12:00:00Z' } : null,
  greeting: null, nextGreetingAt: null, fetchedAt: '2026-09-10T12:00:00Z',
})
const calls = (page: Page, name: string) => page.evaluate(n => (window as Harness).__COMPANION_CALLS__.filter(call => call.name === n), name)

describe('Companion invitation, sharing and greeting interactions', () => {
  let browser: Browser
  let server: { listen: () => Promise<void>; close: () => Promise<void>; httpServer: { address: () => string | { port: number } | null } }
  let baseUrl = ''
  beforeAll(async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const { createServer } = await import(pathToFileURL(path.join(root, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')).href)
    const fixture = (name: string) => path.join(root, 'src/components/companions/__tests__/fixtures', name)
    server = await createServer({ configFile: false, root, appType: 'spa', cacheDir: path.join(root, 'node_modules/.vite-companions-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      optimizeDeps: { entries: [fixture('companions.html')], include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'lucide-react', '@radix-ui/react-dialog', '@radix-ui/react-avatar', '@radix-ui/react-slot', 'class-variance-authority', 'clsx', 'tailwind-merge'] },
      resolve: { dedupe: ['react', 'react-dom'], alias: [
        { find: '@/app/actions/companions', replacement: fixture('actions.fixture.ts') },
        { find: '@/components/navigation/AccountWorkspaceMenu', replacement: fixture('account.fixture.tsx') },
        { find: 'next/navigation', replacement: fixture('navigation.fixture.ts') },
        { find: 'next/link', replacement: path.join(root, 'src/components/coaching/__tests__/fixtures/nextLink.fixture.tsx') },
        { find: '@', replacement: path.join(root, 'src') },
      ] }, server: { host: '127.0.0.1', port: 0, hmr: false },
    })
    await server.listen()
    const address = server.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Companion fixture did not bind')
    baseUrl = `http://127.0.0.1:${address.port}/src/components/companions/__tests__/fixtures/companions.html`
    browser = await chromium.launch({ headless: true })
    await warmupFixture(browser, baseUrl, '__COMPANION_READY__')
  }, 90_000)
  afterAll(async () => { await browser?.close(); await server?.close() }, 30_000)

  async function open(value = snapshot(), query = '', width = 390, card = false) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    await page.clock.install({ time: new Date('2026-09-10T12:00:00Z') })
    await page.goto(baseUrl + query)
    await page.evaluate(({ value, card }) => {
      const h = window as Harness
      h.__COMPANION_CALLS__ = []
      h.__COMPANION_ACTIONS__ = {
        loadCompanion: async () => ({ ok: true, value }),
        getCompanionCode: async () => ({ ok: true, value: { code: 'VKR-A123B456C789', expiresAt: '2026-10-10T16:00:00Z' } }),
        previewCompanionCode: async code => ({ ok: true, value: { code, person: { userId: 'partner-a', fullName: 'Marina Pérez', avatarUrl: null }, expiresAt: '2026-10-10T16:00:00Z' } }),
        sendCompanionInvitation: async () => ({ ok: true, value: { ...value, status: 'pending_outgoing', relationship: { id: 'relationship-a', other: { userId: 'partner-a', fullName: 'Marina Pérez', avatarUrl: null }, expiresAt: '2026-10-10T16:00:00Z' } } }),
        respondCompanionInvitation: async (_id, accept) => ({ ok: true, value: { ...value, status: accept ? 'active' : 'none', relationship: accept ? value.relationship : null } }),
        cancelCompanionInvitation: async () => ({ ok: true, value: { ...value, status: 'none', relationship: null } }),
        leaveCompanion: async () => ({ ok: true, value: { ...value, status: 'none', relationship: null, partner: null, greeting: null, receivedGreeting: null } }),
        sendCompanionGreeting: async (_id, message) => ({ ok: true, value: { ...value, greeting: { sentAt: new Date().toISOString(), message }, nextGreetingAt: new Date(Date.now() + 86_400_000).toISOString() } }),
      }
      h.__renderCompanion({ ok: true, value }, true, card)
    }, { value, card })
    return page
  }

  const completedTogether = (): CompanionSnapshot => ({
    ...snapshot(),
    self: { ...snapshot().self!, completedSessions: 2, goal: 2 },
    partner: { ...snapshot().partner!, completedSessions: 4, goal: 4 },
  })

  it('separates the received greeting from the sent greeting and preserves the sender daily quota', async () => {
    const received = '<img src=x onerror="alert(1)"> ¡Vamos juntos! 💪'
    const page = await open({ ...snapshot(), receivedGreeting: { sentAt: '2026-09-10T11:00:00Z', message: received }, greeting: { sentAt: '2026-09-10T10:00:00Z', message: 'Mi saludo para ti' }, nextGreetingAt: '2026-09-11T04:00:00Z' })
    try {
      const incoming = page.getByRole('region', { name: 'Un saludo de Marina Pérez' })
      await pwExpect(incoming).toContainText(received)
      await pwExpect(incoming.locator('time')).toHaveAttribute('datetime', '2026-09-10T11:00:00Z')
      await pwExpect(incoming.locator('img')).toHaveCount(0)
      await pwExpect(incoming).not.toContainText('Mi saludo para ti')
      await pwExpect(page.getByRole('region', { name: 'Tu último saludo' })).toContainText('Mi saludo para ti')
      await pwExpect(page.getByRole('button', { name: 'Saludo enviado hoy', exact: true })).toBeDisabled()
      expect(await calls(page, 'sendCompanionGreeting')).toHaveLength(0)
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }), { ...snapshot(), receivedGreeting: { sentAt: '2026-09-10T11:00:00Z', message: received } })
      await pwExpect(incoming).toBeVisible()
      await pwExpect(page.getByRole('button', { name: 'Escribir saludo', exact: true })).toBeEnabled()
    } finally { await page.close() }
  })

  it('celebrates each own weekly goal while keeping dashboard counts and greeting access', async () => {
    const value = completedTogether()
    const page = await open(value)
    try {
      await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toBeVisible()
      await pwExpect(page.getByText('Cada uno alcanzó la meta de su propio plan.', { exact: true })).toBeVisible()
      await pwExpect(page.getByRole('progressbar', { name: 'Tú, 2 de 2 sesiones semanales' })).toBeVisible()
      await pwExpect(page.getByRole('progressbar', { name: 'Marina Pérez, 4 de 4 sesiones semanales' })).toBeVisible()
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }, true, true), value)
      await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toBeVisible()
      await pwExpect(page.getByText('4 de 4 sesiones esta semana', { exact: true })).toBeVisible()
      await pwExpect(page.getByRole('link', { name: 'Escribir un saludo a Marina Pérez' })).toBeVisible()
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }, true, true), { ...value, nextGreetingAt: '2026-09-11T04:00:00Z' })
      await pwExpect(page.getByText('4 de 4 sesiones esta semana', { exact: true })).toBeVisible()
      await pwExpect(page.getByRole('img', { name: 'Ya enviaste tu saludo de hoy' })).toBeVisible()
      expect(await calls(page, 'sendCompanionGreeting')).toHaveLength(0)
    } finally { await page.close() }
  })

  it('withholds the shared achievement without two known reached goals in the current same week', async () => {
    const value = completedTogether()
    for (const invalid of [
      { ...value, self: { ...value.self!, goal: null } },
      { ...value, partner: { ...value.partner!, completedSessions: 3 } },
      { ...value, partner: { ...value.partner!, weekStart: '2026-08-31', weekEnd: '2026-09-06' } },
      { ...value, partner: null },
      snapshot('pending_outgoing'),
    ]) {
      const page = await open(invalid)
      try {
        await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toHaveCount(0)
        await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }, true, true), invalid)
        await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toHaveCount(0)
      } finally { await page.close() }
    }
  })

  it('retains the received greeting and current achievement with the offline notice then clears private data on unlink or account change', async () => {
    const value = { ...completedTogether(), receivedGreeting: { sentAt: '2026-09-10T11:00:00Z', message: 'Un saludo privado de Marina' } }
    const page = await open(value)
    try {
      await pwExpect(page.getByText('Un saludo privado de Marina', { exact: true })).toBeVisible()
      await page.evaluate(() => (window as Harness).__renderCompanion({ ok: false, code: 'unavailable', error: 'offline fixture' }, true, false, 'viewer-a'))
      await pwExpect(page.getByText('Sin conexión · Mostrando el último resumen.', { exact: true })).toBeVisible()
      await pwExpect(page.getByText('Un saludo privado de Marina', { exact: true })).toBeVisible()
      await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toBeVisible()
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }), value)
      await page.getByRole('button', { name: 'Opciones de compañero', exact: true }).click()
      await page.getByRole('button', { name: 'Sí, dejar de compartir', exact: true }).click()
      await pwExpect(page.getByText('Un saludo privado de Marina', { exact: true })).toHaveCount(0)
      await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toHaveCount(0)
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }), value)
      await pwExpect(page.getByText('Un saludo privado de Marina', { exact: true })).toBeVisible()
      await page.evaluate(() => (window as Harness).__renderCompanion({ ok: false, code: 'unavailable', error: 'different account' }, true, false, 'viewer-b'))
      await pwExpect(page.getByText('Un saludo privado de Marina', { exact: true })).toHaveCount(0)
      await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toHaveCount(0)
      const replacement = { ...snapshot(), relationship: { ...snapshot().relationship!, id: 'relationship-b', other: { ...snapshot().relationship!.other, userId: 'partner-b', fullName: 'Luis Díaz' } } }
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }), replacement)
      await pwExpect(page.getByRole('heading', { name: 'Luis Díaz', level: 2, exact: true })).toBeVisible()
      await pwExpect(page.getByRole('region', { name: 'Un saludo de Marina Pérez' })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('hides cached achievements at week rollover while mounted and after focus resumes', async () => {
    for (const card of [false, true]) {
      const page = await open({ ...completedTogether(), offline: true }, '', 390, card)
      try {
        await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toBeVisible()
        await page.clock.fastForward(4 * 86_400_000)
        await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toHaveCount(0)
        await pwExpect(page.getByText('Sin conexión · Mostrando el último resumen.', { exact: true })).toBeVisible()
        expect(await calls(page, 'sendCompanionGreeting')).toHaveLength(0)
      } finally { await page.close() }
    }
    const page = await open(completedTogether())
    try {
      await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toBeVisible()
      await page.clock.setSystemTime(new Date('2026-09-14T12:00:00Z'))
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('keeps the enhanced hub and dashboard readable at mobile and desktop widths in both languages', async () => {
    await mkdir('.artifacts/companions', { recursive: true })
    const value = { ...completedTogether(), receivedGreeting: { sentAt: '2026-09-10T11:00:00Z', message: 'Cada uno a su ritmo. ¡Qué alegría completar la semana contigo! 💪' } }
    for (const width of [320, 390, 1440]) {
      const page = await open(value, '', width)
      try {
        await pwExpect(page.getByRole('region', { name: 'Un saludo de Marina Pérez' })).toBeVisible()
        await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        // The app scrolls its body; viewport captures preserve that real clipping
        // and the second capture verifies reaching the greeting action by wheel.
        await page.screenshot({ path: `.artifacts/companions/enhanced-hub-${width}.png` })
        await page.mouse.move(width / 2, 600)
        await page.mouse.wheel(0, 650)
        await pwExpect(page.getByRole('button', { name: 'Escribir saludo', exact: true })).toBeInViewport()
        await page.screenshot({ path: `.artifacts/companions/enhanced-hub-greeting-${width}.png` })
        await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }, true, true), value)
        await pwExpect(page.getByText('Semana completada juntos', { exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: `.artifacts/companions/enhanced-card-${width}.png` })
        await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }, true, false, 'viewer-a', 'en'), value)
        await pwExpect(page.getByRole('region', { name: 'A greeting from Marina Pérez' })).toBeVisible()
        await pwExpect(page.getByText('Week completed together', { exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: `.artifacts/companions/enhanced-hub-en-${width}.png` })
      } finally { await page.close() }
    }
  })

  it('reviews the real code owner and sharing scope before sending an invitation', async () => {
    const page = await open(snapshot('none'))
    try {
      await page.getByRole('button', { name: 'Tengo un código', exact: true }).click()
      await page.getByLabel('Código de tu compañero').fill('VKR-B123C456D789')
      await page.getByRole('button', { name: 'Revisar código', exact: true }).click()
      await pwExpect(page.getByRole('heading', { name: 'Marina Pérez', exact: true })).toBeVisible()
      await pwExpect(page.getByText('Su nombre y foto de perfil.', { exact: true })).toBeVisible()
      await pwExpect(page.getByText('Sesiones completadas esta semana y la meta de cada uno.', { exact: true })).toBeVisible()
      expect(await calls(page, 'sendCompanionInvitation')).toHaveLength(0)
      await page.getByRole('button', { name: 'Enviar invitación', exact: true }).click()
      await pwExpect(page.getByText('Invitación enviada', { exact: true })).toBeVisible()
      expect((await calls(page, 'sendCompanionInvitation'))[0].args).toEqual(['VKR-B123C456D789'])
    } finally { await page.close() }
  })

  it('loads a real invitation code once and keeps null weekly goals honest', async () => {
    const page = await open(snapshot('none'))
    try {
      await pwExpect(page.getByText('VKR-A123B456C789', { exact: true })).toBeVisible()
      expect(await calls(page, 'getCompanionCode')).toHaveLength(1)
      const value = snapshot()
      value.partner = { ...value.partner!, goal: null }
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }), value)
      await pwExpect(page.getByText('Sin meta semanal definida.', { exact: true })).toBeVisible()
      await pwExpect(page.getByRole('progressbar', { name: /Marina/ })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('requires incoming consent and exposes a separate confirmation before unlinking', async () => {
    const page = await open(snapshot('pending_incoming'))
    try {
      await pwExpect(page.getByText('Tus medidas, datos de salud y ejercicios no se comparten.', { exact: false })).toBeVisible()
      expect(await calls(page, 'respondCompanionInvitation')).toHaveLength(0)
      await page.getByRole('button', { name: 'Aceptar invitación', exact: true }).click()
      expect((await calls(page, 'respondCompanionInvitation'))[0].args).toEqual(['relationship-a', true])
      await page.getByRole('button', { name: 'Opciones de compañero', exact: true }).click()
      await pwExpect(page.getByRole('dialog', { name: '¿Dejar de compartir?' })).toBeVisible()
      expect(await calls(page, 'leaveCompanion')).toHaveLength(0)
      await page.getByRole('button', { name: 'Conservar compañero', exact: true }).click()
      await pwExpect(page.getByRole('button', { name: 'Opciones de compañero', exact: true })).toBeFocused()
      await page.getByRole('button', { name: 'Opciones de compañero', exact: true }).click()
      await page.getByRole('button', { name: 'Sí, dejar de compartir', exact: true }).click()
      await pwExpect(page.getByRole('button', { name: 'Mi código', exact: true })).toBeVisible()
      expect(await calls(page, 'leaveCompanion')).toHaveLength(1)
    } finally { await page.close() }
  })

  it('retains a cancelled or failed greeting and retries once with its original idempotency key', async () => {
    const page = await open()
    try {
      await page.getByRole('button', { name: 'Escribir saludo', exact: true }).click()
      await page.getByLabel('Tu mensaje').fill('Sigue así 💪')
      await page.getByRole('button', { name: 'Volver sin enviar', exact: true }).click()
      expect(await calls(page, 'sendCompanionGreeting')).toHaveLength(0)
      await page.getByRole('button', { name: 'Escribir saludo', exact: true }).click()
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveValue('Sigue así 💪')
      await page.evaluate(() => { (window as Harness).__COMPANION_ACTIONS__.sendCompanionGreeting = async () => ({ ok: false, error: 'secret raw database error', code: 'NETWORK_ERROR' }) })
      await page.getByRole('button', { name: 'Enviar saludo', exact: true }).click()
      await pwExpect(page.getByRole('alert')).not.toContainText('secret raw database error')
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveValue('Sigue así 💪')
      await page.evaluate(value => { const h = window as Harness; h.__COMPANION_ACTIONS__.sendCompanionGreeting = async (_id, message) => new Promise(resolve => { h.__RESOLVE_COMPANION__ = () => resolve({ ok: true, value: { ...value, greeting: { message, sentAt: new Date().toISOString() }, nextGreetingAt: new Date(Date.now() + 86_400_000).toISOString() } }) }) }, snapshot())
      await page.getByRole('button', { name: 'Reintentar envío', exact: true }).dblclick()
      const attempts = await calls(page, 'sendCompanionGreeting')
      expect(attempts).toHaveLength(2)
      expect(attempts[0].args).toEqual(attempts[1].args)
      expect(attempts[1].args[2]).toMatch(/^[0-9a-f-]{36}$/i)
      await page.evaluate(() => (window as Harness).__RESOLVE_COMPANION__?.())
      await pwExpect(page.getByRole('button', { name: 'Saludo enviado hoy', exact: true })).toBeDisabled()
    } finally { await page.close() }
  })

  it('allows writing offline without sending and validates unicode by code point before submit', async () => {
    const page = await open({ ...snapshot(), offline: true }, '?view=message')
    try {
      await page.getByLabel('Tu mensaje').fill('💪'.repeat(120))
      await pwExpect(page.getByText('120 / 120', { exact: true })).toBeVisible()
      await pwExpect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeDisabled()
      expect(await calls(page, 'sendCompanionGreeting')).toHaveLength(0)
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }), snapshot())
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveValue('💪'.repeat(120))
      await pwExpect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeEnabled()
      await page.getByLabel('Tu mensaje').fill('  ' + '💪'.repeat(120) + '  ')
      await pwExpect(page.getByText('120 / 120', { exact: true })).toBeVisible()
      await pwExpect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeEnabled()
      await page.getByLabel('Tu mensaje').fill('💪'.repeat(121))
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveAttribute('aria-invalid', 'true')
      await pwExpect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeDisabled()
      await page.getByLabel('Tu mensaje').fill('')
      await page.getByRole('button', { name: 'Enviar saludo', exact: true }).click()
      expect((await calls(page, 'sendCompanionGreeting'))[0].args[1]).toBe('👏 ¡Bien hecho!')
    } finally { await page.close() }
  })

  it('keeps a used daily quota across a changed partner without attributing an old greeting', async () => {
    const page = await open({ ...snapshot(), nextGreetingAt: new Date(Date.now() + 86_400_000).toISOString() }, '?view=message')
    try {
      await pwExpect(page.getByText('Ya enviaste tu saludo de hoy', { exact: true })).toBeVisible()
      await pwExpect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toHaveCount(0)
      expect(await calls(page, 'sendCompanionGreeting')).toHaveLength(0)
    } finally { await page.close() }
  })

  it('allows unlinking an unavailable partner without inventing progress or offering a greeting', async () => {
    const page = await open({ ...snapshot(), partner: null }, '?view=message')
    try {
      await pwExpect(page.getByText('Resumen no disponible.', { exact: true })).toBeVisible()
      await pwExpect(page.getByRole('button', { name: 'Saludo no disponible', exact: true })).toBeDisabled()
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveCount(0)
      await page.getByRole('button', { name: 'Opciones de compañero', exact: true }).click()
      await pwExpect(page.getByRole('button', { name: 'Sí, dejar de compartir', exact: true })).toBeEnabled()
      expect(await calls(page, 'sendCompanionGreeting')).toHaveLength(0)
    } finally { await page.close() }
  })

  it('clears private drafts on a new viewer or unmount and ignores a late previous send', async () => {
    const page = await open(snapshot(), '?view=message')
    try {
      await page.getByLabel('Tu mensaje').fill('Texto privado de la cuenta A')
      await page.evaluate(value => { const h = window as Harness; h.__COMPANION_ACTIONS__.sendCompanionGreeting = async () => new Promise(resolve => { h.__RESOLVE_COMPANION__ = () => resolve({ ok: true, value }) }) }, snapshot())
      await page.getByRole('button', { name: 'Enviar saludo', exact: true }).click()
      const other = { ...snapshot(), viewerId: 'viewer-b', relationship: { ...snapshot().relationship!, id: 'relationship-b' } }
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }), other)
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveValue('')
      await page.evaluate(() => (window as Harness).__RESOLVE_COMPANION__?.())
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveValue('')
      await page.getByLabel('Tu mensaje').fill('Otro borrador privado')
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }, false), other)
      await pwExpect(page.getByText('Otra pantalla', { exact: true })).toBeVisible()
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }), other)
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveValue('')
      expect(await page.evaluate(() => Object.values(localStorage).join(' '))).not.toContain('borrador privado')
    } finally { await page.close() }
  })

  it('keeps a draft through a same-viewer transient refresh and accepts its confirmed pending send', async () => {
    const page = await open(snapshot(), '?view=message')
    try {
      await page.getByLabel('Tu mensaje').fill('La constancia se comparte')
      await page.evaluate(() => (window as Harness).__renderCompanion({ ok: false, code: 'stale_result', error: 'private stale diagnostic' }, true, false, 'viewer-a'))
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveValue('La constancia se comparte')
      await pwExpect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeDisabled()
      expect(await calls(page, 'sendCompanionGreeting')).toHaveLength(0)
      await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }, true, false, 'viewer-a'), snapshot())
      await pwExpect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeEnabled()
      await page.evaluate(value => { const h = window as Harness; h.__COMPANION_ACTIONS__.sendCompanionGreeting = async (_id, message) => new Promise(resolve => { h.__RESOLVE_COMPANION__ = () => resolve({ ok: true, value: { ...value, greeting: { message, sentAt: new Date().toISOString() }, nextGreetingAt: new Date(Date.now() + 86_400_000).toISOString() } }) }) }, snapshot())
      await page.getByRole('button', { name: 'Enviar saludo', exact: true }).click()
      await page.evaluate(() => (window as Harness).__renderCompanion({ ok: false, code: 'busy', error: 'private mutation diagnostic' }, true, false, 'viewer-a'))
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveValue('La constancia se comparte')
      await page.evaluate(() => (window as Harness).__RESOLVE_COMPANION__?.())
      await pwExpect(page.getByRole('button', { name: 'Saludo enviado hoy', exact: true })).toBeDisabled()
      expect(await calls(page, 'sendCompanionGreeting')).toHaveLength(1)
      await page.evaluate(() => (window as Harness).__renderCompanion({ ok: false, code: 'unavailable', error: 'private network diagnostic' }, true, false, 'viewer-b'))
      await pwExpect(page.getByText('La constancia se comparte', { exact: true })).toHaveCount(0)
      await pwExpect(page.getByRole('heading', { name: 'Marina Pérez', level: 2 })).toHaveCount(0)
    } finally { await page.close() }
  })

  it('ignores superseded reconnect reads and never labels a first greeting as a send retry', async () => {
    const page = await open(snapshot(), '?view=message')
    try {
      await page.getByLabel('Tu mensaje').fill('No he enviado este mensaje')
      for (const code of ['stale_result', 'busy']) {
        await page.evaluate(async code => {
          const h = window as Harness
          h.__COMPANION_ACTIONS__.loadCompanion = async () => ({ ok: false, code, error: 'private read diagnostic' })
          window.dispatchEvent(new Event('online'))
          await new Promise(resolve => setTimeout(resolve, 20))
        }, code)
        await pwExpect(page.getByRole('alert')).toHaveCount(0)
        await pwExpect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeEnabled()
      }
      await page.evaluate(async () => {
        const h = window as Harness
        h.__COMPANION_ACTIONS__.loadCompanion = async () => ({ ok: false, code: 'unavailable', error: 'private read diagnostic' })
        window.dispatchEvent(new Event('online'))
        await new Promise(resolve => setTimeout(resolve, 20))
      })
      await pwExpect(page.getByRole('alert')).toContainText('No se pudo actualizar tu compañero.')
      await pwExpect(page.getByRole('button', { name: 'Enviar saludo', exact: true })).toBeEnabled()
      await pwExpect(page.getByLabel('Tu mensaje')).toHaveValue('No he enviado este mensaje')
      expect(await calls(page, 'sendCompanionGreeting')).toHaveLength(0)
    } finally { await page.close() }
  })

  it('renders the dashboard entry and real weekly values without overflow on mobile and desktop', async () => {
    await mkdir('.artifacts/companions', { recursive: true })
    for (const width of [320, 390, 1440]) {
      const page = await open(snapshot(), '', width)
      try {
        await pwExpect(page.getByRole('heading', { name: 'Marina Pérez', level: 2, exact: true })).toBeVisible()
        await pwExpect(page.getByRole('progressbar', { name: /Marina Pérez/ })).toHaveAttribute('aria-valuenow', '2')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: `.artifacts/companions/hub-${width}.png`, fullPage: true })
        await page.getByRole('button', { name: 'Escribir saludo', exact: true }).click()
        await page.getByLabel('Tu mensaje').fill('Cada paso cuenta. ¡Sigue así! 💪')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: `.artifacts/companions/message-${width}.png`, fullPage: true })
        await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }), snapshot('none'))
        await pwExpect(page.getByText('VKR-A123B456C789', { exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: `.artifacts/companions/invitation-${width}.png`, fullPage: true })
        await page.evaluate(value => (window as Harness).__renderCompanion({ ok: true, value }, true, true), snapshot())
        await pwExpect(page.getByRole('link', { name: /Ver a tu compañero/ })).toHaveAttribute('href', '/companion')
        await pwExpect(page.getByRole('link', { name: /Escribir un saludo/ })).toHaveAttribute('href', '/companion?view=message')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        await page.screenshot({ path: `.artifacts/companions/card-${width}.png`, fullPage: true })
      } finally { await page.close() }
    }
  })
})
