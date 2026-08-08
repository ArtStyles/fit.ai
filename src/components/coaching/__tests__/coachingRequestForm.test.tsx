import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

vi.mock('@/app/actions/coachingRequests', () => ({
  createCoachingRequest: async () => ({ ok: true, requestId: 'request-1', created: true }),
  cancelCoachingRequest: async () => ({ ok: true, requestId: 'request-1' }),
}))
import { CoachingRequestForm, CoachingActionAnnouncement, performCoachingRequestSubmit } from '../CoachingRequestForm'
import { ClientCoachingStatus, performCoachingRequestCancellation } from '../ClientCoachingStatus'

describe('coaching request UI', () => {
  it('renders an accessible versioned consent request form without contact or chat fields', () => {
    const html = renderToStaticMarkup(
      <CoachingRequestForm service={{ id: 'service-1', name: 'Acompañamiento de fuerza' }} />,
    )

    expect(html).toContain('Solicitar acompañamiento')
    expect(html).toContain('perfil de entrenamiento')
    expect(html).toContain('consentVersion')
    expect(html).toContain('aria-describedby="training-profile-consent-description"')
    expect(html).not.toMatch(/teléfono|correo|chat|whatsapp/i)
  })

  it('shows real request states and exposes cancellation only for pending requests', () => {
    const html = renderToStaticMarkup(
      <ClientCoachingStatus requests={[
        { id: 'request-1', status: 'pending', createdAt: '2026-08-08T12:00:00.000Z' },
        { id: 'request-2', status: 'declined', createdAt: '2026-08-07T12:00:00.000Z' },
      ]} />,
    )

    expect(html).toContain('Pendiente')
    expect(html).toContain('No aceptada')
    expect(html.match(/Cancelar solicitud/g)).toHaveLength(1)
  })
})

describe('coaching request interaction failures', () => {
  it('recovers pending controls and communicates safe errors when either server action rejects', async () => {
    const requestPending = vi.fn()
    const requestErrors = vi.fn()
    const requestAnnouncement = vi.fn()
    const cancelPending = vi.fn()
    const cancelAnnouncement = vi.fn()

    await performCoachingRequestSubmit(new FormData(), async () => { throw new Error('transport failed') }, {
      setPending: requestPending,
      setFieldErrors: requestErrors,
      setAnnouncement: requestAnnouncement,
      rotateIdempotencyKey: vi.fn(),
    })
    await performCoachingRequestCancellation('request-1', async () => { throw new Error('transport failed') }, {
      setCancellingId: cancelPending,
      setMessage: cancelAnnouncement,
    })

    expect(requestPending.mock.calls.map(([value]) => value)).toEqual([true, false])
    expect(requestErrors).toHaveBeenCalledWith({})
    expect(requestAnnouncement).toHaveBeenCalledWith('No se pudo enviar la solicitud.', true)
    expect(cancelPending.mock.calls.map(([value]) => value)).toEqual(['request-1', null])
    expect(cancelAnnouncement).toHaveBeenCalledWith('No se pudo cancelar la solicitud.', true)
  })

  it('renders rejected request and cancellation failures as safe alerts, while success remains polite', () => {
    const requestFailure = renderToStaticMarkup(<CoachingActionAnnouncement message="No se pudo enviar la solicitud." isError />)
    const cancellationFailure = renderToStaticMarkup(<CoachingActionAnnouncement message="No se pudo cancelar la solicitud." isError />)
    const success = renderToStaticMarkup(<CoachingActionAnnouncement message="La solicitud fue cancelada." isError={false} />)

    expect(requestFailure).toContain('role="alert"')
    expect(requestFailure).toContain('No se pudo enviar la solicitud.')
    expect(cancellationFailure).toContain('role="alert"')
    expect(cancellationFailure).toContain('No se pudo cancelar la solicitud.')
    expect(success).not.toContain('role="alert"')
    expect(success).toContain('aria-live="polite"')
  })
})

describe('coaching request browser interactions', () => {
  let browser: Browser
  let viteServer: { listen: () => Promise<void>; close: () => Promise<void>; httpServer: { address: () => string | { port: number } | null } }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false,
      root: repoRoot,
      appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-coaching-request-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      resolve: { alias: [
        { find: '@/app/actions/coachingRequests', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/coachingRequestActions.fixture.ts') },
        { find: '@', replacement: path.join(repoRoot, 'src') },
      ] },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Vite coaching request fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  })

  it('wires rejected request and cancellation results to safe alerts and restored controls', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/coachingRequestInteraction.html?request=failure&cancel=failure`)
      await page.waitForFunction(() => Boolean((window as Window & { __COACHING_REQUEST_READY__?: boolean }).__COACHING_REQUEST_READY__))
      await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: 'Enviar solicitud' }).click()
      await page.getByRole('alert').filter({ hasText: 'No se pudo enviar la solicitud.' }).waitFor({ state: 'visible' })
      expect(await page.getByRole('alert').filter({ hasText: 'No se pudo enviar la solicitud.' }).textContent()).toBe('No se pudo enviar la solicitud.')
      expect(await page.locator('main').innerText()).not.toContain('Internal failure detail')
      await page.waitForFunction(() => !(document.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.disabled)
      await page.getByRole('button', { name: 'Cancelar solicitud' }).click()
      await page.getByRole('alert').filter({ hasText: 'No se pudo cancelar la solicitud.' }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(button => button.textContent?.includes('Cancelar solicitud') && !(button as HTMLButtonElement).disabled))
    } finally {
      await page.close()
    }
  })

  it('wires successful request and cancellation results to polite announcements, not alerts', async () => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/coachingRequestInteraction.html?request=success&cancel=success`)
      await page.waitForFunction(() => Boolean((window as Window & { __COACHING_REQUEST_READY__?: boolean }).__COACHING_REQUEST_READY__))
      await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: 'Enviar solicitud' }).click()
      await page.getByText('Tu solicitud quedó pendiente de respuesta.').waitFor({ state: 'visible' })
      await page.getByRole('button', { name: 'Cancelar solicitud' }).click()
      await page.getByText('La solicitud fue cancelada.').waitFor({ state: 'visible' })
      expect(await page.getByRole('alert').count()).toBe(0)
      expect(await page.locator('[aria-live="polite"]').count()).toBeGreaterThanOrEqual(2)
    } finally {
      await page.close()
    }
  })
})
