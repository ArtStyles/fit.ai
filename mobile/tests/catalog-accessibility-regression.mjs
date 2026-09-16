import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const output = '.artifacts/catalog-accessibility-regression'
const results = []
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const [width, language] of [[390, 'es'], [1440, 'en']]) {
    const state = await newTestAccount({ linked: false })
    Object.assign(state.tables.profiles[0], { language, onboarding_done: true })
    const poster = state.tables.exercises.find(row => row.image_url?.startsWith('/'))
    assert.ok(poster)
    state.tables.exercises = ['strength', 'cardio', 'flexibility', 'balance', 'hiit'].map((type, index) => ({
      ...poster, id: `00000000-0000-4000-8000-00000000000${index}`, name: `${index} Catalog ${type}`, name_es: `${index} Catálogo ${type}`,
      exercise_type: type, difficulty: 'beginner', is_compound: true, muscle_groups: ['chest', 'triceps', 'shoulders', 'back'],
      muscle_groups_es: ['pecho', 'tríceps', 'hombros', 'espalda'], description: 'Exercise details', description_es: 'Detalles del ejercicio',
      video_url: 'https://example.invalid/exercise-video',
    }))
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', isMobile: width < 600, hasTouch: width < 600 })
    await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
    await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort())
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.setDefaultTimeout(8000)
    try {
      await page.goto(`${origin}/login`)
      await installAccountFixture(page, state)
      await page.goto(`${origin}/exercises`)
      const name = language === 'es' ? '0 Catálogo strength' : '0 Catalog strength'
      const detail = page.getByRole('button', { name, exact: true })
      const zoomName = `${language === 'es' ? 'Ampliar imagen de' : 'Enlarge image of'} ${name}`
      const thumbnailZoom = page.getByRole('button', { name: zoomName, exact: true })
      await expect(detail).toBeVisible(); await expect(thumbnailZoom).toBeVisible()
      assert.equal(await detail.evaluate(button => button.tagName), 'BUTTON', 'Card activation must be a native button')
      assert.equal(await thumbnailZoom.evaluate(button => button.tabIndex), 0, 'Zoom must be reachable by keyboard')
      assert.equal(await thumbnailZoom.evaluate(button => !!button.parentElement?.closest('button,[role="button"]')), false, 'Zoom must not be inside another interactive control')
      await expect.poll(() => thumbnailZoom.locator('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)

      async function audit(stage) {
        // Compare settled colors, not the intermediate opacity of the entrance.
        for (const dialog of await page.getByRole('dialog').all()) await expect(dialog).toHaveCSS('opacity', '1')
        const report = await new AxeBuilder({ page }).withRules(['nested-interactive', 'color-contrast', 'aria-dialog-name']).analyze()
        results.push({ width, language, stage, violations: report.violations })
        assert.deepEqual(report.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), [], `Accessibility violations in ${stage}`)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      }
      await audit('catalog')
      await detail.focus(); await page.keyboard.press('Enter')
      let dialog = page.getByRole('dialog', { name, exact: true })
      await expect(dialog).toBeVisible()
      await audit('details')
      const firstClose = dialog.getByRole('button', { name: language === 'es' ? 'Cerrar' : 'Close', exact: true }).first()
      await expect(firstClose).toBeFocused()
      // Both keyboard directions stay within the modal, including a video link.
      for (let index = 0; index < 10; index++) {
        await page.keyboard.press(index < 5 ? 'Tab' : 'Shift+Tab')
        assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'Modal must trap keyboard focus')
      }
      const heroZoom = dialog.getByRole('button', { name: zoomName, exact: true })
      await heroZoom.focus(); await page.keyboard.press('Space')
      const topDialog = page.getByRole('dialog', { name, exact: true }).last()
      await expect(topDialog.getByRole('img', { name, exact: true })).toBeVisible()
      await audit('nested-zoom')
      await page.keyboard.press('Escape')
      await expect(heroZoom).toBeFocused()
      await expect(page.getByRole('dialog', { name, exact: true })).toHaveCount(1)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(detail).toBeFocused()

      await thumbnailZoom.focus(); await page.keyboard.press('Space')
      await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible()
      await page.keyboard.press('Escape'); await expect(thumbnailZoom).toBeFocused()
      // The stretched main control preserves card/touch activation outside the image.
      const card = detail.locator('..'), heading = card.getByRole('heading', { name, exact: true })
      const box = await heading.boundingBox(); assert.ok(box)
      if (width < 600) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      dialog = page.getByRole('dialog', { name, exact: true }); await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: language === 'es' ? 'Cerrar' : 'Close', exact: true }).last().click()
      await expect(detail).toBeFocused()
      await page.screenshot({ path: `${output}/catalog-${language}-${width}.png`, fullPage: true })
      assert.deepEqual(errors, [])
      assert.deepEqual((await storedAccountSnapshot(page)).accounts[0].tables.exercises, state.tables.exercises)
      results.push({ width, language, passed: true })
      console.log(`PASS catalog controls, modal focus, nested zoom and contrast ${language} ${width}px`)
    } catch (error) {
      await page.screenshot({ path: `${output}/failure-${language}-${width}.png`, fullPage: true }).catch(() => {})
      throw error
    } finally { await context.close() }
  }
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ results }, null, 2))
  await browser.close()
}
