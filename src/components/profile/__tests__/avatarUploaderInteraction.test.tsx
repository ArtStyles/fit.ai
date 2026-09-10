import { createRequire } from 'node:module'
import { chromium, expect as pwExpect, type Browser, type Page } from '@playwright/test'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

type Harness = Window & typeof globalThis & {
  __updateAvatar: (form: FormData) => Promise<{ ok: true; url: string } | { ok: false; error: string }>
  __removeAvatar: () => Promise<{ ok: boolean }>
  __renderAvatar: (url: string | null, mounted?: boolean) => void
  __releaseProcessing?: () => void
  __releaseUpload?: () => void
  __createdUrls: string[]
  __revokedUrls: string[]
  __refreshCount: number
}

const OLD_PHOTO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="red"/></svg>')
const NEW_PHOTO = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="blue"/></svg>')
let photoFile: { name: string; mimeType: string; buffer: Buffer }
let browser: Browser
let page: Page
let bundle: string
let errors: string[]

async function buildFixture() {
  const require = createRequire(import.meta.url)
  const viteEntry = createRequire(require.resolve('vitest')).resolve('vite')
  const { build } = await import(createRequire(viteEntry).resolve('esbuild'))
  const mocks = new Map([
    ['next/navigation', 'export const useRouter = () => ({ refresh: () => { window.__refreshCount++ } })'],
    ['@/app/actions/avatar', 'export const updateAvatar = form => window.__updateAvatar(form); export const removeAvatar = () => window.__removeAvatar()'],
  ])
  const result = await build({
    bundle: true, format: 'iife', platform: 'browser', write: false, jsx: 'automatic',
    stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
      import { StrictMode } from 'react'
      import { createRoot } from 'react-dom/client'
      import { AvatarUploader } from './src/components/profile/AvatarUploader'
      import { ToastProvider } from './src/components/feedback/ToastProvider'
      import { I18nProvider } from './src/components/i18n/I18nProvider'
      const root = createRoot(document.getElementById('root'))
      window.__renderAvatar = (url, mounted = true) => root.render(
        <StrictMode><I18nProvider language="es" syncDocumentLanguage={false}><ToastProvider>
          {mounted ? <section data-avatar-prop={url ?? ''}><AvatarUploader avatarUrl={url} initials="AN" size="lg" showRemove /></section> : <p>Otra pantalla</p>}
        </ToastProvider></I18nProvider></StrictMode>
      )
    ` },
    plugins: [{ name: 'avatar-external-boundaries', setup(api: {
      onResolve: (options: { filter: RegExp }, handler: (args: { path: string }) => { path: string; namespace: string } | null) => void
      onLoad: (options: { filter: RegExp; namespace: string }, handler: (args: { path: string }) => { contents: string | undefined; loader: 'js'; resolveDir: string }) => void
    }) {
      api.onResolve({ filter: /.*/ }, args => mocks.has(args.path) ? { path: args.path, namespace: 'avatar-mock' } : null)
      api.onLoad({ filter: /.*/, namespace: 'avatar-mock' }, args => ({ contents: mocks.get(args.path), loader: 'js', resolveDir: process.cwd() }))
    } }],
  })
  return result.outputFiles[0].text
}

describe('AvatarUploader recovery and image lifetime', () => {
  beforeAll(async () => {
    bundle = await buildFixture(); browser = await chromium.launch({ headless: true })
    const imagePage = await browser.newPage({ viewport: { width: 40, height: 40 } })
    try {
      await imagePage.setContent('<body style="margin:0;background:blue"></body>')
      photoFile = { name: 'avatar.png', mimeType: 'image/png', buffer: await imagePage.screenshot() }
    } finally { await imagePage.close() }
  }, 60_000)
  afterAll(async () => { await browser?.close() })
  beforeEach(async () => {
    page = await browser.newPage()
    errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setContent('<html><body><div id="root"></div></body></html>')
    await page.evaluate(() => {
      const h = window as Harness
      h.__createdUrls = []; h.__revokedUrls = []; h.__refreshCount = 0
      const create = URL.createObjectURL.bind(URL); const revoke = URL.revokeObjectURL.bind(URL)
      URL.createObjectURL = blob => { const url = create(blob); h.__createdUrls.push(url); return url }
      URL.revokeObjectURL = url => { h.__revokedUrls.push(url); revoke(url) }
    })
    await page.addScriptTag({ content: bundle })
    await page.evaluate(url => { (window as Harness).__renderAvatar(url) }, OLD_PHOTO)
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', OLD_PHOTO)
  })
  afterEach(async () => { await page?.close() })

  it('blocks another selection throughout image processing and saving', async () => {
    await page.evaluate(() => {
      const h = window as Harness
      const decode = window.createImageBitmap.bind(window)
      const gate = new Promise<void>(resolve => { h.__releaseProcessing = resolve })
      window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => gate.then(() => decode(...args))) as typeof createImageBitmap
      h.__updateAvatar = () => new Promise(resolve => { h.__releaseUpload = () => resolve({ ok: false, error: 'No se pudo subir la imagen.' }) })
    })
    await page.locator('input[type=file]').setInputFiles(photoFile)
    await pwExpect(page.getByRole('button', { name: 'Cambiar foto' })).toBeDisabled()
    await pwExpect(page.locator('input[type=file]')).toBeDisabled()
    await page.evaluate(() => { (window as Harness).__releaseProcessing!() })
    await pwExpect.poll(() => page.evaluate(() => Boolean((window as Harness).__releaseUpload))).toBe(true)
    await pwExpect(page.getByRole('button', { name: 'Cambiar foto' })).toBeDisabled()
    await page.evaluate(() => { (window as Harness).__releaseUpload!() })
    await pwExpect(page.getByRole('button', { name: 'Cambiar foto' })).toBeEnabled()
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', OLD_PHOTO)
    expect(errors).toEqual([])
  })

  it('recovers after an upload rejects and uses the confirmed image on retry', async () => {
    await page.evaluate(() => { (window as Harness).__updateAvatar = async () => { throw new Error('Network rejected') } })
    await page.locator('input[type=file]').setInputFiles(photoFile)
    await pwExpect(page.getByText('No se pudo guardar la foto', { exact: true })).toBeVisible()
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', OLD_PHOTO)
    await pwExpect(page.getByRole('button', { name: 'Cambiar foto' })).toBeEnabled()
    await page.evaluate(url => { (window as Harness).__updateAvatar = async () => ({ ok: true, url }) }, NEW_PHOTO)
    await page.locator('input[type=file]').setInputFiles(photoFile)
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', NEW_PHOTO)
    const lifetime = await page.evaluate(() => { const h = window as Harness; return { created: h.__createdUrls, revoked: h.__revokedUrls, refresh: h.__refreshCount } })
    expect(lifetime.created).toHaveLength(2)
    expect(lifetime.revoked).toEqual(lifetime.created)
    expect(lifetime.refresh).toBe(1)
    expect(errors).toEqual([])
  })

  it('adopts the successful URL immediately and respects a later profile refresh', async () => {
    await page.evaluate(url => { (window as Harness).__updateAvatar = async () => ({ ok: true, url }) }, NEW_PHOTO)
    await page.locator('input[type=file]').setInputFiles(photoFile)
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', NEW_PHOTO)
    await page.evaluate(() => { (window as Harness).__renderAvatar(null) })
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveCount(0)
    await pwExpect(page.getByText('AN', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })

  it('does not resurrect an uploaded photo after confirmed props return to the original empty value', async () => {
    await page.evaluate(() => { (window as Harness).__renderAvatar(null) })
    await pwExpect(page.getByText('AN', { exact: true })).toBeVisible()
    await page.evaluate(url => { (window as Harness).__updateAvatar = async () => ({ ok: true, url }) }, NEW_PHOTO)
    await page.locator('input[type=file]').setInputFiles(photoFile)
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', NEW_PHOTO)
    await page.evaluate(url => { (window as Harness).__renderAvatar(url) }, NEW_PHOTO)
    await pwExpect(page.locator('[data-avatar-prop]')).toHaveAttribute('data-avatar-prop', NEW_PHOTO)
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', NEW_PHOTO)
    await page.evaluate(() => { (window as Harness).__renderAvatar(null) })
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveCount(0)
    await pwExpect(page.getByText('AN', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })

  it('preserves the current photo when removal rejects and allows a successful retry', async () => {
    await page.evaluate(() => { (window as Harness).__removeAvatar = async () => { throw new Error('Transport failed') } })
    await page.getByRole('button', { name: 'Quitar foto' }).click()
    await pwExpect(page.getByText('No se pudo eliminar la foto', { exact: true })).toBeVisible()
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveAttribute('src', OLD_PHOTO)
    await page.evaluate(() => { (window as Harness).__removeAvatar = async () => ({ ok: true }) })
    await page.getByRole('button', { name: 'Quitar foto' }).click()
    await pwExpect(page.getByRole('img', { name: 'Foto de perfil' })).toHaveCount(0)
    await pwExpect(page.getByText('AN', { exact: true })).toBeVisible()
    await pwExpect(page.getByRole('button', { name: 'Quitar foto' })).toHaveCount(0)
    expect(errors).toEqual([])
  })

  it('releases the preview when navigating away during an upload', async () => {
    await page.evaluate(() => {
      const h = window as Harness
      h.__updateAvatar = () => new Promise(resolve => { h.__releaseUpload = () => resolve({ ok: true, url: 'https://example.test/unused.webp' }) })
    })
    await page.locator('input[type=file]').setInputFiles(photoFile)
    await pwExpect.poll(() => page.evaluate(() => (window as Harness).__createdUrls.length)).toBe(1)
    await page.evaluate(() => { (window as Harness).__renderAvatar(null, false) })
    await pwExpect.poll(() => page.evaluate(() => (window as Harness).__revokedUrls)).toEqual(await page.evaluate(() => (window as Harness).__createdUrls))
    await page.evaluate(() => { (window as Harness).__releaseUpload!() })
    await pwExpect(page.getByText('Otra pantalla')).toBeVisible()
    expect(await page.evaluate(() => (window as Harness).__refreshCount)).toBe(0)
    expect(errors).toEqual([])
  })

  it('does not start an upload if navigation finishes before image processing', async () => {
    await page.evaluate(() => {
      const h = window as Harness
      const decode = window.createImageBitmap.bind(window)
      const gate = new Promise<void>(resolve => { h.__releaseProcessing = resolve })
      window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => gate.then(() => decode(...args))) as typeof createImageBitmap
      const encode = HTMLCanvasElement.prototype.toBlob
      HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
        encode.call(this, blob => { callback(blob); document.body.dataset.processingDone = 'true' }, ...args)
      }
      h.__updateAvatar = async () => { document.body.dataset.uploadStarted = 'true'; return { ok: true, url: 'https://example.test/unused.webp' } }
    })
    await page.locator('input[type=file]').setInputFiles(photoFile)
    await page.evaluate(() => { (window as Harness).__renderAvatar(null, false) })
    await pwExpect(page.getByText('Otra pantalla')).toBeVisible()
    await page.evaluate(() => { (window as Harness).__releaseProcessing!() })
    await pwExpect(page.locator('body')).toHaveAttribute('data-processing-done', 'true')
    expect(await page.locator('body').getAttribute('data-upload-started')).toBeNull()
    expect(await page.evaluate(() => (window as Harness).__createdUrls)).toEqual([])
    expect(errors).toEqual([])
  })
})
