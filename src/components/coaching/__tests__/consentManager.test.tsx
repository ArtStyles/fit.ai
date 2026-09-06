import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { chromium, type Browser } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('@/app/actions/coachingRelationships', () => ({
  grantTrainingProfileConsent: async () => ({ ok: true, relationshipId: 'relationship-1', changed: true }),
  grantBodyMeasurementsConsent: async () => ({ ok: true, relationshipId: 'relationship-1', changed: true }),
  revokeBodyMeasurementsConsent: async () => ({ ok: true, relationshipId: 'relationship-1', changed: true }),
  revokeTrainingProfileConsent: async () => ({ ok: true, relationshipId: 'relationship-1', changed: true }),
}))

import { ConsentManager } from '../ConsentManager'
import { I18nProvider } from '@/components/i18n/I18nProvider'

describe('ConsentManager', () => {
  it('offers a non-live required-data recovery without exposing the destructive revoke action', () => {
    const html = renderToStaticMarkup(
      <I18nProvider language="es" timeZone="America/Havana" syncDocumentLanguage={false}>
        <ConsentManager relationshipId="relationship-1" consents={[]} />
      </I18nProvider>,
    )

    expect(html).toContain('Datos para preparar tu rutina — Necesario')
    expect(html).toContain('Medidas corporales — Opcional')
    expect(html).toContain('Falta un paso para recibir tu rutina')
    expect(html).toContain('Tus medidas corporales no se incluyen.')
    expect(html).toContain('Autorizar datos de entrenamiento')
    expect(html).not.toContain('Revocar datos de entrenamiento')
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('role="alert"')
  })

  it('shows an active required authorization and keeps its destructive revoke action', () => {
    const html = renderToStaticMarkup(
      <I18nProvider language="es" timeZone="America/Havana" syncDocumentLanguage={false}>
        <ConsentManager relationshipId="relationship-1" consents={[
          { scope: 'training_profile', textVersion: 'training-profile-v1', grantedAt: '2026-08-08T12:00:00.000Z', revokedAt: null },
          { scope: 'body_measurements', textVersion: 'body-measurements-v1', grantedAt: '2026-08-08T12:00:00.000Z', revokedAt: null },
        ]} />
      </I18nProvider>,
    )

    expect(html).toContain('Datos para preparar tu rutina — Necesario')
    expect(html).toContain('Medidas corporales — Opcional')
    expect(html).toContain('Autorización activa')
    expect(html).toContain('training-profile-v1')
    expect(html).toContain('body-measurements-v1')
    expect(html).toContain('Revocar datos de entrenamiento')
    expect(html).toContain('Revocar medidas corporales')
    expect(html).toContain('finalizará el acompañamiento')
    expect(html).toContain('no finalizará el acompañamiento')
  })
})

describe('ConsentManager browser interactions', () => {
  let browser: Browser
  let viteServer: { listen: () => Promise<void>; close: () => Promise<void>; httpServer: { address: () => string | { port: number } | null } }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false, root: repoRoot, appType: 'spa',
      cacheDir: path.join(repoRoot, 'node_modules', '.vite-consent-manager-test'),
      oxc: { jsx: { runtime: 'automatic' } },
      resolve: { alias: [
        { find: 'next/navigation', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/consentActions.fixture.ts') },
        { find: '@/app/actions/coachingRelationships', replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/consentActions.fixture.ts') },
        { find: '@', replacement: path.join(repoRoot, 'src') },
      ] },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Vite consent fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  })

  it('keeps body consent independent and restores accessible controls after a safe failure', async () => {
    const page = await browser.newPage()
    try {
      page.on('dialog', dialog => dialog.accept())
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/consentManager.html?revoke-body=failure`)
      await page.waitForFunction(() => Boolean((window as Window & { __CONSENT_MANAGER_READY__?: boolean }).__CONSENT_MANAGER_READY__))
      await page.getByRole('button', { name: 'Revocar medidas corporales' }).click()
      await page.getByRole('alert').filter({ hasText: 'No se pudo actualizar el consentimiento.' }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => !(Array.from(document.querySelectorAll('button')).find(button => button.textContent?.includes('Revocar medidas corporales')) as HTMLButtonElement | undefined)?.disabled)
      expect(await page.getByRole('heading', { name: 'Datos para preparar tu rutina — Necesario' }).count()).toBe(1)
      expect(await page.getByRole('heading', { name: 'Medidas corporales — Opcional' }).count()).toBe(1)
    } finally {
      await page.close()
    }
  })

  it('keeps the training recovery key across failure retries, clears it after success, and refreshes', async () => {
    const page = await browser.newPage()
    try {
      page.on('dialog', dialog => dialog.accept())
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/consentManager.html?missing-training=true&grant-training=fail-once`)
      await page.waitForFunction(() => Boolean((window as Window & { __CONSENT_MANAGER_READY__?: boolean }).__CONSENT_MANAGER_READY__))
      const grantButton = page.getByRole('button', { name: 'Autorizar datos de entrenamiento' })

      await grantButton.click()
      await page.getByRole('alert').filter({ hasText: 'No se pudo actualizar el consentimiento.' }).waitFor({ state: 'visible' })
      await page.waitForFunction(() => !(document.querySelector('button') as HTMLButtonElement | null)?.disabled)
      await grantButton.click()
      await page.getByText('Tus datos de entrenamiento fueron autorizados.').waitFor({ state: 'visible' })
      await page.waitForFunction(() => (window as Window & { __CONSENT_MANAGER_REFRESH_COUNT__?: number }).__CONSENT_MANAGER_REFRESH_COUNT__ === 1)

      const firstTwoCalls = await page.evaluate(() => (window as Window & {
        __CONSENT_ACTION_CALLS__?: Array<{ action: string; idempotencyKey: string }>
      }).__CONSENT_ACTION_CALLS__?.slice(0, 2) ?? [])
      expect(firstTwoCalls.map(call => call.action)).toEqual(['grant-training', 'grant-training'])
      expect(firstTwoCalls[0]?.idempotencyKey).toBeTruthy()
      expect(firstTwoCalls[1]?.idempotencyKey).toBe(firstTwoCalls[0]?.idempotencyKey)

      await grantButton.click()
      await page.waitForFunction(() => (window as Window & { __CONSENT_MANAGER_REFRESH_COUNT__?: number }).__CONSENT_MANAGER_REFRESH_COUNT__ === 2)
      const calls = await page.evaluate(() => (window as Window & {
        __CONSENT_ACTION_CALLS__?: Array<{ action: string; idempotencyKey: string }>
      }).__CONSENT_ACTION_CALLS__ ?? [])
      expect(calls[2]?.idempotencyKey).not.toBe(calls[1]?.idempotencyKey)
      expect(await grantButton.isEnabled()).toBe(true)
    } finally {
      await page.close()
    }
  })
})
