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
import { I18nProvider } from '@/components/i18n/I18nProvider'

function renderStatus(element: React.ReactElement): string {
  return renderToStaticMarkup(
    <I18nProvider language="es" timeZone="America/Havana" syncDocumentLanguage={false}>
      {element}
    </I18nProvider>,
  )
}

describe('coaching request UI', () => {
  it('renders an accessible versioned consent request form without contact or chat fields', () => {
    const html = renderStatus(
      <CoachingRequestForm service={{ id: 'service-1', name: 'Acompañamiento de fuerza' }} />,
    )

    expect(html).toContain('Solicitar acompañamiento')
    expect(html).toContain('perfil de entrenamiento')
    expect(html).toContain('consentVersion')
    expect(html).toContain('aria-describedby="training-profile-consent-description"')
    expect(html).not.toMatch(/teléfono|correo|chat|whatsapp/i)
  })

  it('shows real request states and exposes cancellation only for pending requests', () => {
    const html = renderStatus(
      <ClientCoachingStatus requests={[
        { id: 'request-1', status: 'pending', createdAt: '2026-08-08T12:00:00.000Z', trainerName: 'Marina Pérez', trainerAvatarUrl: null, serviceName: 'Fuerza guiada' },
        { id: 'request-2', status: 'declined', createdAt: '2026-08-07T12:00:00.000Z', trainerName: 'Luis Sosa', trainerAvatarUrl: null, serviceName: 'Movilidad' },
      ]} />,
    )

    expect(html).toContain('Pendiente')
    expect(html).toContain('No aceptada')
    expect(html.match(/Cancelar solicitud/g)).toHaveLength(1)
  })

  it('shows a client-controlled accessible confirmation before ending or resuming a relationship', () => {
    const active = renderStatus(<ClientCoachingStatus requests={[]} relationship={{ id: 'relationship-1', status: 'active', startedAt: '2026-08-08T12:00:00.000Z', sourceRequestId: null, trainerName: 'Marina Pérez', trainerAvatarUrl: null, serviceName: 'Fuerza guiada' }} />)
    const paused = renderStatus(<ClientCoachingStatus requests={[]} relationship={{ id: 'relationship-2', status: 'paused_by_platform', startedAt: '2026-08-08T12:00:00.000Z', sourceRequestId: null, trainerName: 'Luis Sosa', trainerAvatarUrl: null, serviceName: 'Movilidad' }} />)

    expect(active).toContain('Acompañamiento activo')
    expect(active).toContain('Finalizar acompañamiento')
    expect(active).toContain('aria-controls="client-relationship-confirmation"')
    expect(paused).toContain('Acompañamiento pausado')
    expect(paused).toContain('Reanudar acompañamiento')
  })

  it('puts a named current trainer before differentiated request history and explains when an accepted request is older', () => {
    const html = renderStatus(<ClientCoachingStatus
      relationship={{
        id: 'relationship-current',
        status: 'active',
        trainerName: 'Marina Pérez',
        trainerAvatarUrl: 'https://example.test/marina.jpg',
        serviceName: 'Fuerza guiada',
        startedAt: '2026-08-12T12:00:00.000Z',
        sourceRequestId: 'current-request',
      }}
      requests={[
        { id: 'old-accepted', status: 'accepted', createdAt: '2026-08-01T12:00:00.000Z', trainerName: 'Luis Sosa', trainerAvatarUrl: null, serviceName: 'Movilidad' },
        { id: 'current-request', status: 'accepted', createdAt: '2026-08-12T12:00:00.000Z', trainerName: 'Marina Pérez', trainerAvatarUrl: 'https://example.test/marina.jpg', serviceName: 'Fuerza guiada' },
      ]}
    />)

    expect(html).toContain('Marina Pérez')
    expect(html).toContain('Fuerza guiada')
    expect(html).toContain('Iniciado el')
    expect(html).toContain('Esta solicitud aceptada corresponde a un acompañamiento anterior.')
    expect(html.indexOf('Marina Pérez')).toBeLessThan(html.indexOf('Tus solicitudes'))
  })

  it('guides a client without a trainer to the public directory', () => {
    const html = renderStatus(<ClientCoachingStatus requests={[]} />)

    expect(html).toContain('Aún no tienes un entrenador conectado.')
    expect(html).toContain('href="/trainers"')
    expect(html).toContain('Buscar entrenadores')
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
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-dom/client', '@radix-ui/react-avatar'],
      },
      resolve: { dedupe: ['react', 'react-dom'], alias: [
        { find: '@/app/actions/coachingRequests', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/coachingRequestActions.fixture.ts') },
        { find: 'next/navigation', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/nextNavigation.fixture.ts') },
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
      await page.getByRole('alert').filter({ hasText: 'Este servicio ya no está disponible.' }).waitFor({ state: 'visible' })
      expect(await page.getByRole('alert').filter({ hasText: 'Este servicio ya no está disponible.' }).textContent()).toBe('Este servicio ya no está disponible.')
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
      await page.getByRole('link', { name: 'Ver estado' }).waitFor({ state: 'visible' })
      expect(await page.getByRole('link', { name: 'Ver estado' }).getAttribute('href')).toBe('/coaching')
      await page.getByRole('button', { name: 'Cancelar solicitud' }).click()
      await page.getByText('La solicitud fue cancelada.').waitFor({ state: 'visible' })
      expect(await page.getByRole('alert').count()).toBe(0)
      expect(await page.locator('[aria-live="polite"]').count()).toBeGreaterThanOrEqual(2)
    } finally {
      await page.close()
    }
  })

  it('replaces a successfully accepted request with actions for that named client', async () => {
    const page = await browser.newPage()
    try {
      page.on('dialog', dialog => dialog.accept())
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/coachRequestQueue.html?accept=success`)
      await page.waitForFunction(() => Boolean((window as Window & { __COACH_QUEUE_READY__?: boolean }).__COACH_QUEUE_READY__))
      await page.getByRole('button', { name: 'Aceptar' }).click()
      await page.getByRole('status').filter({ hasText: 'Ana Pérez ya forma parte de tu acompañamiento.' }).waitFor({ state: 'visible' })
      expect(await page.getByRole('link', { name: 'Ver cliente' }).getAttribute('href')).toBe('/coach/clients/11111111-1111-4111-8111-111111111111')
      expect(await page.getByRole('link', { name: 'Preparar rutina' }).getAttribute('href')).toBe('/coach/programs?clientId=11111111-1111-4111-8111-111111111111')
      expect(await page.getByRole('button', { name: 'Aceptar' }).count()).toBe(0)
    } finally {
      await page.close()
    }
  })

  it('keeps the accepted-client continuation visible beside remaining pending requests', async () => {
    const page = await browser.newPage()
    try {
      page.on('dialog', dialog => dialog.accept())
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/coachRequestQueue.html?accept=success&two=1`)
      await page.waitForFunction(() => Boolean((window as Window & { __COACH_QUEUE_READY__?: boolean }).__COACH_QUEUE_READY__))
      await page.getByRole('button', { name: 'Aceptar' }).first().click()
      await page.getByRole('status').filter({ hasText: 'Ana Pérez ya forma parte de tu acompañamiento.' }).waitFor({ state: 'visible' })
      expect(await page.getByRole('link', { name: 'Ver cliente' }).getAttribute('href')).toBe('/coach/clients/11111111-1111-4111-8111-111111111111')
      expect(await page.getByRole('link', { name: 'Preparar rutina' }).getAttribute('href')).toBe('/coach/programs?clientId=11111111-1111-4111-8111-111111111111')
      await page.getByText('Beatriz Núñez').waitFor({ state: 'visible' })
      await page.getByText('Servicio restante').waitFor({ state: 'visible' })
    } finally {
      await page.close()
    }
  })

  it('removes sibling requests cancelled atomically when accepting the same client', async () => {
    const page = await browser.newPage()
    try {
      page.on('dialog', dialog => dialog.accept())
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/coachRequestQueue.html?accept=success&sameClient=1`)
      await page.waitForFunction(() => Boolean((window as Window & { __COACH_QUEUE_READY__?: boolean }).__COACH_QUEUE_READY__))
      const acceptButtons = page.getByRole('button', { name: 'Aceptar' })
      expect(await acceptButtons.count()).toBe(2)
      await acceptButtons.first().click()
      await page.getByRole('status').filter({ hasText: 'Ana Pérez ya forma parte de tu acompañamiento.' }).waitFor({ state: 'visible' })
      expect(await page.getByText('Servicio alternativo').count()).toBe(0)
      expect(await acceptButtons.count()).toBe(0)
    } finally {
      await page.close()
    }
  })

  it('reconciles a refreshed conflict with server props that removed every same-client request', async () => {
    const page = await browser.newPage()
    try {
      page.on('dialog', dialog => dialog.accept())
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/coachRequestQueue.html?accept=conflict&sameClient=1&serverAfterRefresh=empty`)
      await page.waitForFunction(() => Boolean((window as Window & { __COACH_QUEUE_READY__?: boolean }).__COACH_QUEUE_READY__))
      const acceptButtons = page.getByRole('button', { name: 'Aceptar' })
      expect(await acceptButtons.count()).toBe(2)

      await acceptButtons.first().click()

      await page.getByText('La solicitud se actualizó. Recarga la bandeja.').waitFor({ state: 'visible' })
      await page.getByRole('heading', { name: 'No hay solicitudes nuevas' }).waitFor({ state: 'visible' })
      expect(await page.getByText('Servicio alternativo').count()).toBe(0)
      expect(await acceptButtons.count()).toBe(0)
      expect(await page.evaluate(() => (window as Window & { __COACH_REFRESHES__?: number }).__COACH_REFRESHES__)).toBe(1)
    } finally {
      await page.close()
    }
  })

  it('removes a terminal coach request and refreshes for both acceptance success and a refreshed race conflict', async () => {
    for (const mode of ['success', 'conflict'] as const) {
      const page = await browser.newPage()
      try {
        page.on('dialog', dialog => dialog.accept())
        await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/coachRequestQueue.html?accept=${mode}`)
        await page.waitForFunction(() => Boolean((window as Window & { __COACH_QUEUE_READY__?: boolean }).__COACH_QUEUE_READY__))
        await page.getByRole('button', { name: 'Aceptar' }).click()
        await page.getByText(mode === 'success' ? 'La solicitud fue aceptada.' : 'La solicitud se actualizó. Recarga la bandeja.').waitFor({ state: 'visible' })
        expect(await page.getByText('Servicio de prueba').count()).toBe(0)
        expect(await page.evaluate(() => (window as Window & { __COACH_REFRESHES__?: number }).__COACH_REFRESHES__)).toBe(1)
        expect(await page.getByRole('button', { name: 'Aceptar' }).count()).toBe(0)
      } finally {
        await page.close()
      }
    }
  })

  it('removes a declined coach request and refreshes the server queue', async () => {
    const page = await browser.newPage()
    try {
      page.on('dialog', dialog => dialog.accept())
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/coachRequestQueue.html`)
      await page.waitForFunction(() => Boolean((window as Window & { __COACH_QUEUE_READY__?: boolean }).__COACH_QUEUE_READY__))
      await page.getByRole('button', { name: 'Rechazar' }).click()
      await page.getByText('La solicitud fue rechazada.').waitFor({ state: 'visible' })
      expect(await page.getByText('Servicio de prueba').count()).toBe(0)
      expect(await page.evaluate(() => (window as Window & { __COACH_REFRESHES__?: number }).__COACH_REFRESHES__)).toBe(1)
    } finally {
      await page.close()
    }
  })
})
