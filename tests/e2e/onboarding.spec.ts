import { expect, test } from '@playwright/test'
import { resetAndSignInAsE2EUser } from './helpers/auth'

test.describe.configure({ mode: 'serial' })

test('verified account completes exactly five guarded stages and reaches its generated plan', async ({ page }) => {
  test.setTimeout(240_000)
  await resetAndSignInAsE2EUser(page)

  const visibleStages: string[] = []
  async function expectStage(step: number, title: string) {
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
    await expect(page.getByText(`Paso ${step} de 5`, { exact: true })).toBeVisible()
    visibleStages.push(title)
  }

  await expectStage(1, 'Empecemos por ti')
  await page.getByLabel('Nombre completo', { exact: true }).fill('Activation E2E')
  await page.getByLabel('Nombre de usuario', { exact: true }).fill('codex_ui_seo_e2e')
  await page.getByRole('button', { name: /^Mantenerme activo/ }).click()
  await page.getByRole('button', { name: /^Principiante/ }).click()
  await expect(page.getByText('Nombre disponible.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Continuar con mi disponibilidad', exact: true }).click()

  await expectStage(2, 'Tu ritmo, tu agenda')
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.getByRole('button', { name: '30 min', exact: true }).click()
  await page.getByRole('button', { name: 'Caminar', exact: true }).click()
  await page.getByRole('button', { name: /^Actividad regular/ }).click()
  await page.getByRole('button', { name: 'Continuar con mi espacio', exact: true }).click()

  await expectStage(3, 'Dónde vas a entrenar')
  await page.getByRole('button', { name: /^Casa sin equipo/ }).click()
  await page.getByRole('button', { name: 'Continuar con seguridad', exact: true }).click()

  await expectStage(4, 'Seguridad antes que intensidad')
  await page.evaluate(() => {
    const key = 'fitai_onboarding_v2'
    const state = JSON.parse(localStorage.getItem(key) ?? '{}')
    localStorage.setItem(key, JSON.stringify({ ...state, stage: 'confirmation', safetyReviewed: false }))
  })
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Seguridad antes que intensidad', exact: true })).toBeVisible()

  const warning = page.getByLabel('Molestia o dolor en pecho, cuello, mandíbula o brazos', { exact: true })
  await warning.check()
  await expect(page.getByRole('alert').filter({ hasText: 'Se requiere orientación profesional' })).toBeVisible()
  await page.getByRole('button', { name: 'Revisar mi información', exact: true }).click()

  await expectStage(5, 'Confirma tu punto de partida')
  await page.getByRole('button', { name: 'Otro', exact: true }).click()
  await page.getByLabel('Edad', { exact: true }).fill('30')
  await page.getByLabel('Peso (kg)', { exact: true }).fill('70')
  await page.getByLabel('Altura (cm)', { exact: true }).fill('175')
  await expect(page.getByRole('button', { name: 'Generar mi plan automáticamente', exact: true })).toBeDisabled()
  await expect(page.getByRole('alert').filter({ hasText: 'La generación automática está bloqueada' })).toBeVisible()

  await page.getByRole('button', { name: 'Atrás', exact: true }).click()
  await warning.uncheck()
  await page.getByRole('button', { name: 'Revisar mi información', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Generar mi plan automáticamente', exact: true })).toBeEnabled()

  expect(visibleStages).toEqual([
    'Empecemos por ti',
    'Tu ritmo, tu agenda',
    'Dónde vas a entrenar',
    'Seguridad antes que intensidad',
    'Confirma tu punto de partida',
  ])
  await page.getByRole('button', { name: 'Generar mi plan automáticamente', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Preparando tu primer plan', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 60_000 })
})
