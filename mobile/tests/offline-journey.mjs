import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'

const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  await context.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }))
  await context.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:4178/') ? route.continue() : route.abort())
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4178')
  await page.getByLabel('Tu nombre').fill('Prueba offline')
  await page.getByLabel('Edad', { exact: true }).fill('30')
  await page.getByLabel('He revisado mis respuestas').check()
  await page.getByRole('button', { name: 'Crear mi espacio' }).click()
  await page.screenshot({ path: 'mobile/tests/home-390.png', fullPage: true })
  await page.getByRole('button', { name: 'Crear mi primera rutina' }).click()
  await page.getByRole('button', { name: 'Empezar entrenamiento' }).first().click()
  const firstExercise = page.locator('.exercise-record').first()
  await firstExercise.getByRole('spinbutton').nth(0).fill('12')
  await firstExercise.getByRole('spinbutton').nth(1).fill('20')
  await page.getByRole('button', { name: 'Completar serie 1' }).first().click()
  await firstExercise.getByRole('spinbutton').nth(2).fill('10')
  await firstExercise.getByRole('spinbutton').nth(3).fill('20')
  await firstExercise.getByRole('button', { name: 'Completar serie 2' }).click()
  const secondExercise = page.locator('.exercise-record').nth(1)
  await secondExercise.getByRole('spinbutton').nth(1).fill('15')
  await secondExercise.getByRole('button', { name: 'Completar serie 1' }).click()
  await page.getByText('Guardado en este dispositivo', { exact: true }).waitFor()
  await page.screenshot({ path: 'mobile/tests/workout-390.png', fullPage: true })
  await page.reload()
  await page.getByRole('button', { name: 'Continuar entrenamiento' }).click()
  assert.equal(await page.getByRole('button', { name: /Desmarcar serie/ }).count(), 3)
  assert.equal(await page.locator('.exercise-record').first().getByRole('spinbutton').nth(0).inputValue(), '12')
  assert.equal(await page.locator('.exercise-record').first().getByRole('spinbutton').nth(1).inputValue(), '20')
  await page.getByRole('button', { name: 'Finalizar entrenamiento' }).click()
  await page.getByRole('button', { name: 'Guardar entrenamiento' }).click()
  await page.getByText('Entrenamiento guardado').waitFor()
  await page.reload()
  await page.getByRole('button', { name: 'Historial', exact: true }).click()
  await page.getByText('1 entrenamiento', { exact: true }).waitFor()
  // Simulate missing selection metadata without removing any saved profile data.
  const persistedBytes = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('vekira-mobile-sqlite', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const read = database.transaction('databases').objectStore('databases').get('vekira-offline')
      read.onerror = () => reject(read.error)
      read.onsuccess = () => { resolve(Array.from(read.result)); database.close() }
    }
  }))
  const SQL = await initSqlJs()
  const sqlite = new SQL.Database(new Uint8Array(persistedBytes))
  sqlite.run("UPDATE mobile_settings SET value = NULL WHERE key = 'active_account_id'")
  await page.evaluate(bytes => new Promise((resolve, reject) => {
    const request = indexedDB.open('vekira-mobile-sqlite', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('databases', 'readwrite')
      transaction.objectStore('databases').put(new Uint8Array(bytes), 'vekira-offline')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => reject(transaction.error)
    }
  }), Array.from(sqlite.export()))
  sqlite.close()
  await page.reload()
  await page.getByRole('button', { name: 'Abrir perfil de Prueba offline', exact: true }).click()
  await page.getByRole('button', { name: 'Historial', exact: true }).click()
  await page.getByText('1 entrenamiento', { exact: true }).waitFor()
  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`)
    await page.screenshot({ path: `mobile/tests/history-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar respaldo' }).click()
  const download = await downloadPromise
  const backup = await download.path()
  await page.getByLabel('Importar respaldo').setInputFiles(backup)
  await page.getByText('Respaldo importado').waitFor()
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Crear otro perfil local' }).click()
  await page.getByLabel('Tu nombre').fill('Segundo perfil')
  await page.getByLabel('Edad', { exact: true }).fill('28')
  await page.getByLabel('He revisado mis respuestas').check()
  await page.getByRole('button', { name: 'Crear mi espacio' }).click()
  await page.getByRole('button', { name: 'Historial', exact: true }).click()
  await page.getByText('Tu historia empieza aquí').waitFor()
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByRole('button', { name: 'Cambiar', exact: true }).click()
  await page.getByRole('button', { name: 'Historial', exact: true }).click()
  await page.getByText('1 entrenamiento', { exact: true }).waitFor()
  console.log('PASS: built offline profile, plan, durable workout reload, completion, history, backup, account isolation, 360/390/768')
} finally { await browser.close() }
