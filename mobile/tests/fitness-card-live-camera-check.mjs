import { expect } from '@playwright/test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QRCodeSVG } from 'qrcode.react'

/** Feed genuine QR pixels through a browser MediaStream and the production decoder. */
export async function verifyFitnessCardLiveCamera(page, ownerId, options = {}) {
  const cases = options.cases ?? (process.env.FITNESS_LIVE_CAMERA_CASES || 'centered,offcenter,large,restart,visibility,native-empty').split(',')
  const timeout = options.timeout ?? 8000
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, {
    value: `vekira://fitness-card/${ownerId}`, size: 512, level: 'M', marginSize: 4,
    xmlns: 'http://www.w3.org/2000/svg',
  }))
  await page.evaluate(async svgText => {
    const devices = navigator.mediaDevices
    const original = Object.getOwnPropertyDescriptor(devices, 'getUserMedia')
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    const visibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    const barcodeDetector = Object.getOwnPropertyDescriptor(window, 'BarcodeDetector')
    const image = new Image()
    const imageUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }))
    image.src = imageUrl
    await image.decode()
    URL.revokeObjectURL(imageUrl)
    const layouts = {
      centered: { x: 200, y: 120, size: 240 },
      // A square object-cover viewport shows x=80..560 and y=0..480.
      // These codes remain wholly visible but exceed the old central 320px ROI.
      offcenter: { x: 96, y: 144, size: 240 },
      large: { x: 100, y: 20, size: 440 },
    }
    const state = {
      layout: 'blank', requests: 0, frames: 0, records: [], nativeEmptyCalls: 0,
      installEmptyDetector() {
        state.nativeEmptyCalls = 0
        // Only this protocol test substitutes the platform's no-detection result.
        // QR recognition cases always use the genuine production decoder.
        class EmptyBarcodeDetector {
          static async getSupportedFormats() { return ['qr_code'] }
          async detect() { state.nativeEmptyCalls++; return [] }
        }
        Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: EmptyBarcodeDetector })
      },
      restoreDetector() {
        if (barcodeDetector) Object.defineProperty(window, 'BarcodeDetector', barcodeDetector)
        else delete window.BarcodeDetector
      },
      draw() {
        for (const record of state.records) {
          const { context, canvas, stream } = record
          context.fillStyle = '#d8dce2'
          context.fillRect(0, 0, canvas.width, canvas.height)
          const box = layouts[state.layout]
          if (box) context.drawImage(image, box.x, box.y, box.size, box.size)
          // A changing pixel ensures new video frames even on unchanged QR content.
          context.fillStyle = state.frames % 2 ? '#101010' : '#202020'
          context.fillRect(0, 0, 2, 2)
          for (const track of stream.getVideoTracks()) track.requestFrame?.()
        }
        state.frames++
      },
      setLayout(layout) { state.layout = layout; state.draw() },
      setHidden(value) {
        Object.defineProperty(document, 'hidden', { configurable: true, value })
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: value ? 'hidden' : 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
      },
      restoreVisibility() {
        if (hidden) Object.defineProperty(document, 'hidden', hidden)
        else delete document.hidden
        if (visibility) Object.defineProperty(document, 'visibilityState', visibility)
        else delete document.visibilityState
        document.dispatchEvent(new Event('visibilitychange'))
      },
      restore() {
        clearInterval(state.timer)
        if (original) Object.defineProperty(devices, 'getUserMedia', original)
        else delete devices.getUserMedia
        state.restoreDetector()
        state.restoreVisibility()
        for (const record of state.records) for (const track of record.tracks) track.stop()
      },
    }
    window.__fitnessLiveCameraFixture = state
    Object.defineProperty(devices, 'getUserMedia', { configurable: true, value: async () => {
      state.requests++
      const canvas = document.createElement('canvas')
      canvas.width = 640; canvas.height = 480
      const context = canvas.getContext('2d')
      context.imageSmoothingEnabled = false
      const stream = canvas.captureStream(25)
      state.records.push({ canvas, context, stream, tracks: stream.getTracks() })
      state.draw()
      return stream
    } })
    state.timer = setInterval(() => state.draw(), 40)
  }, svg)

  const scanner = page.getByRole('dialog', { name: 'Escanear Fitness Card', exact: true })
  const invite = page.getByRole('dialog', { name: 'Conecta con su progreso.', exact: true })
  const cameraButton = () => scanner.getByRole('button', { name: /^(Usar cámara|Reiniciar cámara)$/ })
  const live = () => scanner.locator('video').evaluate(element => {
    const tracks = element.srcObject?.getVideoTracks() ?? []
    return tracks.length > 0 && tracks.every(track => track.readyState === 'live') && element.readyState >= 2
  })
  const setLayout = layout => page.evaluate(value => window.__fitnessLiveCameraFixture.setLayout(value), layout)
  const released = () => page.evaluate(() => window.__fitnessLiveCameraFixture.records.every(record => record.tracks.every(track => track.readyState === 'ended')))
  const begin = async () => {
    await setLayout('blank')
    await page.getByRole('button', { name: 'Escanear QR', exact: true }).click()
    await cameraButton().click()
    await expect.poll(live, { timeout, message: 'Camera must display actual video frames before testing QR detection' }).toBe(true)
  }
  const confirm = async caseName => {
    await expect(invite.getByRole('button', { name: 'Ver mi tarjeta', exact: true }), `${caseName}: actual video QR must reach the correct self-invite`).toBeVisible({ timeout })
    await expect(scanner).not.toBeVisible()
    await expect.poll(released, { timeout, message: `${caseName}: accepted QR must release every camera track` }).toBe(true)
    await invite.getByRole('button', { name: 'Cerrar invitación', exact: true }).click()
    await expect(invite).not.toBeVisible()
  }
  const results = []
  try {
    for (const name of cases) {
      if (name === 'native-empty') {
        await page.evaluate(() => window.__fitnessLiveCameraFixture.installEmptyDetector())
        try {
          await begin()
          await expect.poll(() => page.evaluate(() => window.__fitnessLiveCameraFixture.nativeEmptyCalls), {
            timeout, message: 'The real scanner must exercise BarcodeDetector on multiple blank video frames',
          }).toBeGreaterThanOrEqual(3)
          await expect(scanner.getByRole('alert'), 'Normal empty native detector frames must not display a scanner failure').toHaveCount(0)
          expect(await live(), 'Normal empty native detector frames must keep the camera active').toBe(true)
          await scanner.getByRole('button', { name: 'Cerrar', exact: true }).click()
          await expect(scanner).not.toBeVisible()
          await expect.poll(released, { timeout }).toBe(true)
          results.push({ case: name, emptyFramesAccepted: true, tracksReleased: true })
        } finally {
          if (await scanner.isVisible()) await scanner.getByRole('button', { name: 'Cerrar', exact: true }).click()
          await page.evaluate(() => window.__fitnessLiveCameraFixture.restoreDetector())
        }
        continue
      }
      await begin()
      if (name === 'restart') {
        // No QR yet: the scanner stays open while its previous 300ms cleanup runs.
        await cameraButton().click()
        await expect.poll(live, { timeout }).toBe(true)
        await page.waitForTimeout(450)
        expect(await live(), 'Restarted video must survive cleanup scheduled by its previous scanner').toBe(true)
        await setLayout('centered')
      } else if (name === 'visibility') {
        await page.evaluate(() => window.__fitnessLiveCameraFixture.setHidden(true))
        await expect.poll(released, { timeout }).toBe(true)
        await page.evaluate(() => window.__fitnessLiveCameraFixture.restoreVisibility())
        await expect.poll(live, { timeout, message: 'A requested camera session should resume when the still-open scanner becomes visible' }).toBe(true)
        await setLayout('centered')
      } else {
        if (!['centered', 'offcenter', 'large'].includes(name)) throw new Error(`Unknown live camera case: ${name}`)
        await setLayout(name)
      }
      await confirm(name)
      results.push({ case: name, decoded: true, tracksReleased: true })
    }
    return results
  } finally {
    if (await scanner.isVisible()) await scanner.getByRole('button', { name: 'Cerrar', exact: true }).click()
    if (await invite.isVisible()) await invite.getByRole('button', { name: 'Cerrar invitación', exact: true }).click()
    await page.evaluate(() => {
      window.__fitnessLiveCameraFixture?.restore()
      delete window.__fitnessLiveCameraFixture
    })
  }
}
