import { expect, test } from './fixtures'
import { signInAsE2EUser } from './helpers/auth'
import {
  assertHistoryContinuityE2EReady,
  cleanupHistoryContinuityFixture,
  isHistoryContinuityE2EEnabled,
  seedCoreProductFixture,
  seedCoreProgressHistory,
  seedHistoryContinuityFixture,
} from './helpers/core-product'

test('training evidence routes form one navigable journey', async ({ page }) => {
  test.setTimeout(180_000)
  const fixture = await seedCoreProductFixture('es')
  const { progressLogId } = await seedCoreProgressHistory(fixture)
  await signInAsE2EUser(page)

  await page.goto('/calendario')
  await expect(page.getByRole('heading', { name: /actividad del mes|monthly activity/i })).toBeVisible()
  await expect(page.getByText(/día seleccionado|selected day/i)).toBeVisible()

  await page.goto('/progress')
  await expect(page.getByRole('heading', { name: /tu progreso tiene dirección|your progress has direction/i })).toBeVisible()
  await page.getByRole('button', { name: /4 semanas|4 weeks/i }).click()

  await page.goto('/history')
  await expect(page.getByRole('heading', { name: /registro cronológico|chronological log/i })).toBeVisible()

  await page.goto(`/history/${progressLogId}`)
  await expect(page.getByRole('heading', { name: /secuencia de la sesión|session sequence/i })).toBeVisible()

  await page.goto(`/exercises/${fixture.exerciseId}`)
  await expect(page.getByRole('heading', { name: /evolución de fuerza|strength progression/i })).toBeVisible()
})

test('completed evidence survives plan activation, retirement, and source detachment', async ({ page }) => {
  test.skip(!isHistoryContinuityE2EEnabled(process.env),
    'Set E2E_HISTORY_CONTINUITY_ENABLED=true only for a dedicated migrated E2E Supabase project.')
  test.setTimeout(180_000)

  try {
    await assertHistoryContinuityE2EReady()
  } catch {
    test.skip(true, 'Continuity migrations are not available on the dedicated E2E database.')
    return
  }

  const fixture = await seedHistoryContinuityFixture('es')
  try {
    await signInAsE2EUser(page)

    await page.goto('/history')
    await expect(page.locator(`a[href="/history/${fixture.progressLogId}"]`)).toBeVisible()
    await expect(page.getByText('E2E Plan A Legs', { exact: true }).first()).toBeVisible()

    await page.goto(`/history/${fixture.progressLogId}`)
    await expect(page.getByText('E2E Plan A Legs', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/665 kg/)).toBeVisible()

    await page.goto('/calendario')
    await expect(page.getByText('E2E Plan A Legs', { exact: true }).first()).toBeVisible()

    await page.goto('/progress')
    await expect(page.getByText(/665 kg/)).toBeVisible()

    await page.goto('/dashboard')
    await expect(page.getByText('E2E Plan A Legs', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('E2E Plan B Full Body', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/realizado con el plan anterior/i)).toBeVisible()
    await expect(page.getByText(/programado en tu plan actual: e2e plan b full body/i)).toBeVisible()
  } finally {
    await cleanupHistoryContinuityFixture(fixture)
  }
})
