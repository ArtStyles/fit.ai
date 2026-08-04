import { expect, test } from './fixtures'
import { signInAsE2EUser } from './helpers/auth'
import { expectNoHorizontalOverflow } from './helpers/acceptance'
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
  await page.getByRole('button', { name: /^(4 semanas|4 weeks)$/i }).click()

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

test('exercise chart keeps period controls inside the mobile card and scrolls bars internally', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375', 'Mobile responsive contract')
  test.setTimeout(120_000)

  const fixture = await seedCoreProductFixture('es')
  await seedCoreProgressHistory(fixture)
  await signInAsE2EUser(page)
  await page.goto(`/exercises/${fixture.exerciseId}`)

  const chart = page.getByRole('region', { name: /evolución de fuerza|strength evolution/i })
  const selector = chart.locator('[aria-label="Seleccionar periodo del gráfico"]')
  const bars = chart.getByRole('group', { name: /peso máximo por aparición|maximum weight by appearance/i })
  const scrollArea = bars.locator('..')

  await expect(chart).toBeVisible()
  await expect(selector).toBeVisible()
  await expect(bars).toBeVisible()

  for (const width of [375, 498]) {
    await page.setViewportSize({ width, height: 1080 })

    const viewport = page.viewportSize()
    const chartBox = await chart.boundingBox()
    const selectorBox = await selector.boundingBox()
    expect(viewport).not.toBeNull()
    expect(chartBox).not.toBeNull()
    expect(selectorBox).not.toBeNull()
    if (!viewport || !chartBox || !selectorBox) throw new Error('Exercise chart geometry is unavailable')

    expect(chartBox.x).toBeGreaterThanOrEqual(0)
    expect(chartBox.x + chartBox.width).toBeLessThanOrEqual(viewport.width)
    expect(selectorBox.x).toBeGreaterThanOrEqual(chartBox.x)
    expect(selectorBox.x + selectorBox.width).toBeLessThanOrEqual(chartBox.x + chartBox.width)
    await expectNoHorizontalOverflow(page)

    const scrollMetrics = await scrollArea.evaluate(element => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.clientWidth)

    await scrollArea.evaluate(element => {
      element.scrollLeft = element.scrollWidth
    })
    expect(await scrollArea.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  }
})
