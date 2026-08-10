import { expect, test } from './fixtures'
import type { Page } from '@playwright/test'
import {
  assertTrainerInsightsE2EReady,
  deriveTrainerRelationshipScope,
  isTrainerInsightsE2EEnabled,
  seedTrainerInsightsFixture,
} from './helpers/core-product'

test.describe.configure({ mode: 'serial' })

function supportedViewport(projectName: string): boolean {
  return projectName === 'mobile-375' || projectName === 'desktop-1440'
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
}

test('trainer insights shows only consent-bound prescribed evidence and cuts it off immediately', async ({ page }, testInfo) => {
  test.skip(!supportedViewport(testInfo.project.name), 'Insights acceptance runs at the required 375px and 1440px viewports only.')
  test.skip(!isTrainerInsightsE2EEnabled(process.env), 'Requires dedicated credentials, migrations 042-044, and explicit insights reset acknowledgement.')
  test.setTimeout(300_000)

  // This read-only preflight is deliberately before the first fixture write.
  await assertTrainerInsightsE2EReady()
  const fixture = await seedTrainerInsightsFixture(deriveTrainerRelationshipScope({
    projectName: testInfo.project.name,
    workerIndex: testInfo.workerIndex,
    parallelIndex: testInfo.parallelIndex,
    retry: testInfo.retry,
  }))

  const proposal = await fixture.createTemplateAndPropose('E2E Insights V1')
  await signIn(page, fixture.client.email, fixture.password)
  await page.goto('/coaching')
  await expect(page.getByRole('heading', { name: 'Rutina profesional propuesta', exact: true })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Aceptar rutina', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Rutina activada')
  await expect(fixture.readAcceptedAssignment(proposal.assignmentId)).resolves.toMatchObject({
    personalPlanStillExists: true,
    personalPlanIsActive: false,
    snapshot: { name: 'E2E Insights V1' },
  })

  const evidence = await fixture.prepareInsightsEvidence()
  expect(evidence.historicalProfessionalProgressLogId).not.toBe(evidence.currentProfessionalProgressLogId)
  expect(evidence.historicalAssignmentVersionId).not.toBe(evidence.currentAssignmentVersionId)
  const professionalSessionIds = await fixture.readProfessionalInsightSessionIds()
  expect(professionalSessionIds).toEqual(expect.arrayContaining([
    evidence.historicalProfessionalProgressLogId,
    evidence.currentProfessionalProgressLogId,
  ]))
  expect(professionalSessionIds).not.toContain(evidence.personalProgressLogId)

  await page.context().clearCookies()
  await signIn(page, fixture.trainerA.email, fixture.password)
  await page.goto('/coach')
  await expect(page.getByRole('heading', { name: 'Resumen profesional', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: fixture.trainerA.professionalName, exact: true })).toBeVisible()

  await page.goto('/coach/clients')
  const clientLink = page.locator(`a[href="/coach/clients/${fixture.client.id}"]`)
  await expect(clientLink).toBeVisible()
  await expect(page.getByText(/Última evidencia profesional:/)).toBeVisible()
  await clientLink.click()
  await expect(page.getByRole('heading', { name: 'E2E client', exact: true })).toBeVisible()
  await expect(page.getByText(/Vista de solo lectura/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Evidencia de sesiones', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: evidence.historicalWorkoutName, exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: evidence.currentWorkoutName, exact: true })).toBeVisible()
  await expect(page.locator('section[aria-labelledby="session-evidence-title"] article')).toHaveCount(evidence.professionalEvidenceCount)
  await expect(page.getByText(/Sets: 2.*Reps: 8, 9.*RPE: 7, 8/)).toHaveCount(evidence.professionalEvidenceCount)
  await expect(page.getByText(/sesiones prescritas \(/)).toBeVisible()
  await expect(page.getByText('Personal E2E session excluded from professional adherence.', { exact: true })).toHaveCount(0)
  await expect(page.locator('section[aria-labelledby="session-evidence-title"] button, section[aria-labelledby="session-evidence-title"] input, section[aria-labelledby="session-evidence-title"] textarea, section[aria-labelledby="session-evidence-title"] select')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Medidas corporales compartidas', exact: true })).toHaveCount(0)

  await fixture.grantBodyMeasurements()
  await page.goto(`/coach/clients/${fixture.client.id}?weeks=4`)
  await expect(page.getByRole('heading', { name: 'Medidas corporales compartidas', exact: true })).toBeVisible()
  await expect(page.getByText(`Peso: ${evidence.measurementWeightKg} kg`, { exact: true })).toBeVisible()

  await fixture.revokeBodyMeasurements()
  // A fresh navigation proves revocation is evaluated by the next request, not a cached privileged reload.
  await page.goto(`/coach/clients/${fixture.client.id}?weeks=12`)
  await expect(page.getByRole('heading', { name: 'Medidas corporales compartidas', exact: true })).toHaveCount(0)
  await expect(page.getByText(`Peso: ${evidence.measurementWeightKg} kg`, { exact: true })).toHaveCount(0)

  await fixture.endActiveRelationship()
  await expect(fixture.readClientInsightsError()).resolves.toBe('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
  await page.goto(`/coach/clients/${fixture.client.id}`)
  await expect(page.getByRole('heading', { name: 'E2E client', exact: true })).toHaveCount(0)
})

test('trainer suspension pauses access and returns the same generic insight response', async ({ page }, testInfo) => {
  test.skip(!supportedViewport(testInfo.project.name), 'Insights acceptance runs at the required 375px and 1440px viewports only.')
  test.skip(!isTrainerInsightsE2EEnabled(process.env), 'Requires dedicated credentials, migrations 042-044, and explicit insights reset acknowledgement.')
  test.setTimeout(300_000)

  await assertTrainerInsightsE2EReady()
  const fixture = await seedTrainerInsightsFixture(deriveTrainerRelationshipScope({
    projectName: `${testInfo.project.name}-suspension`,
    workerIndex: testInfo.workerIndex,
    parallelIndex: testInfo.parallelIndex,
    retry: testInfo.retry,
  }))

  await signIn(page, fixture.trainerA.email, fixture.password)
  await page.goto(`/coach/clients/${fixture.client.id}`)
  await expect(page.getByRole('heading', { name: 'E2E client', exact: true })).toBeVisible()
  await expect(page.getByText(/Vista de solo lectura/)).toBeVisible()

  await fixture.suspendTrainer()
  await expect(fixture.readClientInsightsError()).resolves.toBe('COACH_CLIENT_INSIGHTS_UNAVAILABLE')
  await page.reload()
  await page.goto(`/coach/clients/${fixture.client.id}`)
  await expect(page.getByRole('heading', { name: 'E2E client', exact: true })).toHaveCount(0)
  const { data, error } = await (fixture.service.from('coaching_relationships') as any)
    .select('status').eq('id', fixture.relationshipId).maybeSingle()
  expect(error).toBeNull()
  expect(data?.status).toBe('paused_by_platform')
})
