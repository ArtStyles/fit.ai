import { expect } from '@playwright/test'

/** Android can deliver a picker result before the WebView becomes visible again. */
export async function verifyFitnessCardHiddenImage(page, imageBuffer) {
  await page.evaluate(() => {
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    window.__fitnessHiddenImageFixture = {
      hide() {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true })
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      },
      restore() {
        if (hidden) Object.defineProperty(document, 'hidden', hidden)
        else delete document.hidden
        if (visibility) Object.defineProperty(document, 'visibilityState', visibility)
        else delete document.visibilityState
        document.dispatchEvent(new Event('visibilitychange'))
      },
    }
  })

  const scanner = page.getByRole('dialog', { name: 'Escanear Fitness Card', exact: true })
  const invite = page.getByRole('dialog', { name: 'Conecta con su progreso.', exact: true })
  const open = () => page.getByRole('button', { name: 'Escanear QR', exact: true }).click()
  const hide = () => page.evaluate(() => window.__fitnessHiddenImageFixture.hide())
  const restore = () => page.evaluate(() => window.__fitnessHiddenImageFixture.restore())
  const choose = name => scanner.locator('input[type=file]').setInputFiles({ name, mimeType: 'image/png', buffer: imageBuffer })
  const results = []

  try {
    await open()
    await hide()
    await choose('actual-card-returned-while-hidden.png')
    await expect(invite, 'A hidden reader must not open an invitation').not.toBeVisible()
    await restore()
    await expect(invite.getByRole('button', { name: 'Ver mi tarjeta', exact: true }),
      'A real card image received while hidden must be decoded when the reader returns').toBeVisible({ timeout: 8000 })
    await expect(scanner).not.toBeVisible()
    await invite.getByRole('button', { name: 'Cerrar invitación', exact: true }).click()
    await expect(invite).not.toBeVisible()
    results.push({ case: 'image-result-before-visible', decoded: true })

    await open()
    await hide()
    await choose('actual-card-cancelled-before-visible.png')
    await scanner.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await expect(scanner).not.toBeVisible()
    const lateInvite = page.waitForRequest(request => {
      return new URL(request.url()).pathname.endsWith('/get_fitness_card_invite')
    }, { timeout: 800 }).then(() => true, error => {
      if (error.name === 'TimeoutError') return false
      throw error
    })
    await restore()
    expect(await lateInvite, 'Closing the reader must discard its pending image without requesting an invite').toBe(false)
    await expect(invite, 'A cancelled image must not reopen an invitation after visibility returns').not.toBeVisible()
    results.push({ case: 'hidden-image-cancelled-before-visible', discarded: true })
    return results
  } finally {
    await restore()
    if (await scanner.isVisible()) await scanner.getByRole('button', { name: 'Cerrar', exact: true }).click()
    if (await invite.isVisible()) await invite.getByRole('button', { name: 'Cerrar invitación', exact: true }).click()
    await page.evaluate(() => { delete window.__fitnessHiddenImageFixture })
  }
}
