import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'
import { expectProfessionalPlanReadOnly } from './helpers/acceptance'
import {
  assertTrainerProgrammingE2EReady,
  deriveTrainerRelationshipScope,
  isTrainerProgrammingE2EEnabled,
  seedTrainerProgrammingFixture,
} from './helpers/core-product'

test.describe.configure({ mode: 'serial' })

test('trainer programming keeps immutable prescriptions across acceptance, revision, and execution', async ({ page }, testInfo) => {
  test.skip(!isTrainerProgrammingE2EEnabled(process.env),
    'Requires dedicated E2E credentials, migrations 042/043, and explicit dedicated-project reset acknowledgement.')
  test.setTimeout(300_000)

  await assertTrainerProgrammingE2EReady()
  const fixture = await seedTrainerProgrammingFixture(deriveTrainerRelationshipScope({
    projectName: testInfo.project.name,
    workerIndex: testInfo.workerIndex,
    parallelIndex: testInfo.parallelIndex,
    retry: testInfo.retry,
  }))

  const proposal = await fixture.createTemplateAndPropose('E2E Fuerza V1')

  await page.goto('/login')
  await page.getByLabel('Correo electrÃ³nico', { exact: true }).fill(fixture.client.email)
  await page.getByLabel('ContraseÃ±a', { exact: true }).fill(fixture.password)
  await page.getByRole('button', { name: 'Iniciar sesiÃ³n', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })

  await page.goto('/coaching')
  await expect(page.getByRole('heading', { name: 'Rutina profesional propuesta', exact: true })).toBeVisible()
  await expect(page.getByText('E2E Fuerza V1', { exact: true })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Aceptar rutina', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Rutina activada')

  const accepted = await fixture.readAcceptedAssignment(proposal.assignmentId)
  expect(accepted.planId).toBe(proposal.planId)
  expect(accepted.personalPlanIsActive).toBe(false)
  expect(accepted.personalPlanStillExists).toBe(true)
  expect(accepted.snapshot.name).toBe('E2E Fuerza V1')

  await page.goto('/plan')
  await expectProfessionalPlanReadOnly(page)

  // SessionClient issues a single live authorization lease on navigation. Its
  // locked routine controls are covered by sessionContracts; this journey uses
  // the exact A lease below so a revision cannot displace its snapshot.
  const authorizationA = await fixture.authorizeCurrentProfessionalSession()
  await expect(fixture.saveUnauthorizedProfessionalExercise(authorizationA, randomUUID()))
    .rejects.toThrow(/SESSION_PROFESSIONAL_EXERCISE_FORBIDDEN/)

  const revision = await fixture.publishRevision('E2E Fuerza V2', 'Ajuste semanal profesional')
  expect(revision.versionNumber).toBe(2)
  expect(revision.previousVersionEffectiveTo).not.toBeNull()

  const afterRevision = await fixture.readAuthorizedSession(authorizationA.clientSessionId)
  expect(afterRevision.assignmentVersionId).toBe(proposal.assignmentVersionId)
  expect(afterRevision.planId).toBe(proposal.planId)

  const saved = await fixture.saveAuthorizedSessionWithActualResults(authorizationA)
  expect(saved.inserted).toBe(true)
  expect(saved.skipNote).toBe('Saltado: dolor localizado.')

  await fixture.moveToDifferentPolicyDate()
  const authorizationB = await fixture.authorizeCurrentProfessionalSession()
  expect(authorizationB.assignmentVersionId).toBe(revision.assignmentVersionId)
  expect(authorizationB.planId).toBe(revision.planId)
})
