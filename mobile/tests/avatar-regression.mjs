import { chromium, expect } from '@playwright/test'
import { loadEnv } from 'vite'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4184'
const artifacts = '.artifacts/avatar-regression'
const backend = new URL(loadEnv('production', 'mobile').VITE_SUPABASE_URL).origin
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })
const imagePage = await browser.newPage({ viewport: { width: 32, height: 32 } })
await imagePage.setContent('<body style="margin:0;background:#8b5cf6"></body>')
const photo = { name: 'photo.png', mimeType: 'image/png', buffer: await imagePage.screenshot() }
await imagePage.close()
await writeFile(`${artifacts}/photo.png`, photo.buffer)
const passed = []
try {
  for (const width of [390, 1440]) {
    const state = await newTestAccount({ linked: false })
    Object.assign(state.tables.profiles[0], { full_name: 'Prueba de foto', onboarding_done: true, language: 'es' })
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(origin + '/login')
      await installAccountFixture(page, state)
      await page.goto(origin + '/settings/perfil')
      await expect(page.getByRole('button', { name: 'Cambiar foto', exact: true })).toBeVisible()
      await page.locator('input[type=file]').setInputFiles(photo)
      await expect(page.getByText('Foto actualizada', { exact: true })).toBeVisible({ timeout: 5000 })
      const saved = (await storedAccountSnapshot(page)).accounts[0]
      assert.match(saved.tables.profiles[0].avatar_url, /^data:image\/(webp|jpeg|png);base64,/)
      assert.deepEqual(saved.tables.exercises, state.tables.exercises)
      await page.reload()
      await expect(page.getByRole('button', { name: 'Cambiar foto', exact: true }).getByRole('img', { name: 'Foto de perfil', exact: true })).toHaveAttribute('src', saved.tables.profiles[0].avatar_url)
      await page.screenshot({ path: `${artifacts}/saved-${width}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Quitar foto', exact: true }).click()
      await expect(page.getByText('Foto eliminada', { exact: true })).toBeVisible()
      assert.equal((await storedAccountSnapshot(page)).accounts[0].tables.profiles[0].avatar_url, null)
      await page.reload()
      await expect(page.getByRole('button', { name: 'Quitar foto', exact: true })).toHaveCount(0)
      assert.deepEqual(errors, [])
      passed.push({ width, flow: 'local photo persists and removes offline' })
      console.log(`PASS avatar local at ${width}px`)
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/failure-${width}.png`, fullPage: true }).catch(() => {})
      throw error
    } finally { await context.close() }
  }
  for (const failure of ['none', 'storage', 'profile']) {
    const state = await newTestAccount()
    Object.assign(state.tables.profiles[0], { full_name: 'Prueba conectada', onboarding_done: true, language: 'es', avatar_url: null })
    state.tables.mobile_web_base = [{ id: 'canonical', tables: { profiles: [{ ...state.tables.profiles[0] }] } }]
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    const user = { id: state.accountId, email: state.email, aud: 'authenticated', role: 'authenticated', created_at: new Date().toISOString(), app_metadata: {}, user_metadata: {} }
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: expiresAt, role: 'authenticated' })}.fixture-signature`
    const session = { user, access_token: token, refresh_token: 'fixture', expires_in: 3600, expires_at: expiresAt, token_type: 'bearer' }
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } })
    const requests = []
    const unexpected = []
    let denial = failure
    let remoteUrl = null
    await context.route('**/*', async route => {
      const request = route.request()
      const url = new URL(request.url())
      if (url.origin === origin) return route.continue()
      if (url.origin !== backend) return route.abort()
      const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*' } })
      if (request.method() === 'OPTIONS') return fulfill(null)
      if (url.pathname.startsWith('/storage/v1/object/public/avatars/') && request.method() === 'GET') return route.fulfill({ contentType: 'image/png', body: photo.buffer })
      assert.equal(request.headers().authorization, `Bearer ${token}`)
      if (url.pathname === '/auth/v1/user') return fulfill(user)
      requests.push({ method: request.method(), path: url.pathname })
      if (url.pathname === `/storage/v1/object/avatars/${user.id}/avatar.webp` && request.method() === 'POST') {
        if (denial === 'storage') return fulfill({ statusCode: '403', error: 'Forbidden', message: 'Fixture denial' }, 403)
        return fulfill({ Key: `avatars/${user.id}/avatar.webp`, Id: user.id })
      }
      if (url.pathname === '/rest/v1/profiles' && request.method() === 'PATCH') {
        assert.equal(url.searchParams.get('id'), `eq.${user.id}`)
        if (denial === 'profile') return fulfill({ message: 'Fixture denied profile' }, 403)
        remoteUrl = request.postDataJSON().avatar_url
        return fulfill({ id: user.id, avatar_url: remoteUrl })
      }
      if (url.pathname === '/storage/v1/object/avatars' && request.method() === 'DELETE') {
        assert.deepEqual(request.postDataJSON().prefixes, [`${user.id}/avatar.webp`])
        return fulfill([{ name: `${user.id}/avatar.webp` }])
      }
      unexpected.push({ method: request.method(), path: url.pathname })
      return fulfill({ message: 'Unexpected request' }, 418)
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(origin + '/login')
      await installAccountFixture(page, state)
      await page.evaluate(value => localStorage.setItem('vekira-original-auth', JSON.stringify(value)), session)
      await page.goto(origin + '/settings/perfil')
      await expect(page.getByRole('button', { name: 'Cambiar foto', exact: true })).toBeVisible()
      await page.locator('input[type=file]').setInputFiles(photo)
      if (failure !== 'none') {
        await expect(page.getByText('No se pudo guardar la foto', { exact: true })).toBeVisible()
        assert.equal((await storedAccountSnapshot(page)).accounts[0].tables.profiles[0].avatar_url, null)
        if (failure === 'storage') assert.equal(requests.some(row => row.path === '/rest/v1/profiles'), false)
        denial = 'none'
        await page.locator('input[type=file]').setInputFiles(photo)
      }
      await expect(page.getByText('Foto actualizada', { exact: true })).toBeVisible()
      const saved = (await storedAccountSnapshot(page)).accounts[0]
      assert.equal(saved.tables.profiles[0].avatar_url, remoteUrl)
      assert.equal(saved.tables.mobile_web_base[0].tables.profiles[0].avatar_url, remoteUrl)
      assert.match(remoteUrl, /\/avatar\.webp\?v=\d+$/)
      await page.reload()
      await expect(page.getByRole('button', { name: 'Cambiar foto', exact: true }).getByRole('img', { name: 'Foto de perfil', exact: true })).toHaveAttribute('src', remoteUrl)
      await page.screenshot({ path: `${artifacts}/connected-${failure}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Quitar foto', exact: true }).click()
      await expect(page.getByText('Foto eliminada', { exact: true })).toBeVisible()
      assert.equal(remoteUrl, null)
      assert.equal((await storedAccountSnapshot(page)).accounts[0].tables.profiles[0].avatar_url, null)
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      passed.push({ flow: 'connected upload, confirmation, reload, removal', failure })
      console.log(`PASS connected avatar ${failure}`)
    } catch (error) {
      await page.screenshot({ path: `${artifacts}/failure-connected-${failure}.png`, fullPage: true }).catch(() => {})
      throw error
    } finally { await context.close() }
  }
} finally {
  await browser.close()
  await writeFile(`${artifacts}/results.json`, JSON.stringify({ passed }, null, 2))
}
