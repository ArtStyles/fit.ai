import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import {
  auditCriticalAndSeriousAccessibility,
  expectActionTargetsAtLeast44,
  expectReducedMotionAndSafeArea,
  expectResponsiveGeometry,
  runAllCleanupSteps,
} from './helpers/acceptance'
import {
  cleanupTrainerRelationshipsFixture,
  createTrainerE2EAdminClient,
  deriveTrainerRelationshipScope,
  exerciseTrainerRelationshipLifecycle,
  isTrainerRelationshipsE2EEnabled,
  seedTrainerRelationshipsFixture,
  type TrainerRelationshipsFixture,
} from './helpers/core-product'
import { assertTrainerSecurityRemoteReady } from './helpers/trainer-marketplace'

test.describe.configure({ mode: 'serial' })

let fixture: TrainerRelationshipsFixture | undefined
let templateId: string | undefined

async function cleanupAccessibilityFixture(): Promise<void> {
  const currentFixture = fixture
  const currentTemplateId = templateId
  if (!currentFixture) return
  try {
    await runAllCleanupSteps([
      async () => {
        if (!currentTemplateId) return
        const { error } = await (currentFixture.trainerA.client.from('trainer_program_templates') as any)
          .delete().eq('id', currentTemplateId).eq('trainer_user_id', currentFixture.trainerA.id)
        if (error) throw new Error('Could not delete the exact trainer accessibility template')
      },
      async () => cleanupTrainerRelationshipsFixture(currentFixture),
    ])
  } finally {
    templateId = undefined
    fixture = undefined
  }
}

async function signIn(page: Page, email: string): Promise<void> {
  const password = process.env.E2E_USER_PASSWORD
  if (!password) throw new Error('E2E_USER_PASSWORD is required for trainer accessibility acceptance')
  await page.context().clearCookies()
  await page.goto('/login')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
}

async function auditRoute(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  expect(new URL(page.url()).pathname).toBe(path)
  await expect(page.locator('main')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await auditCriticalAndSeriousAccessibility(page)
  await expectResponsiveGeometry(page)
  await expectActionTargetsAtLeast44(page)
}

test.beforeAll(async ({ browserName }, testInfo) => {
  void browserName
  test.setTimeout(180_000)
  if (!isTrainerRelationshipsE2EEnabled(process.env)) {
    throw new Error('Trainer accessibility E2E requires E2E_TRAINER_RELATIONSHIPS_ENABLED=true')
  }

  // This 045 marker/table probe is read-only and completes before the first
  // account, relationship, or template write below.
  await assertTrainerSecurityRemoteReady(createTrainerE2EAdminClient())
  const scope = deriveTrainerRelationshipScope({
    projectName: `${testInfo.project.name}-accessibility`,
    workerIndex: testInfo.workerIndex,
    parallelIndex: testInfo.parallelIndex,
    retry: testInfo.retry,
  })

  try {
    fixture = await seedTrainerRelationshipsFixture(scope, { skipReadiness: true })
    await exerciseTrainerRelationshipLifecycle(fixture)
    const { data, error } = await (fixture.trainerA.client.from('trainer_program_templates') as any)
      .insert({
        trainer_user_id: fixture.trainerA.id,
        name: 'Accesibilidad E2E',
        goal: 'Validar navegación profesional',
        description: 'Plantilla temporal, editable y sin publicación.',
        days_per_week: 2,
        status: 'draft',
      })
      .select('id')
      .single()
    if (error || !data?.id) throw new Error('Could not create the trainer accessibility template')
    templateId = data.id
  } catch (error) {
    await cleanupAccessibilityFixture()
    throw error
  }
})

test.afterAll(async () => {
  await cleanupAccessibilityFixture()
})

test('all trainer role routes pass Axe and responsive geometry in the active viewport', async ({ page }) => {
  test.setTimeout(300_000)
  if (!fixture || !templateId) throw new Error('Trainer accessibility fixture was not prepared')

  await signIn(page, fixture.client.email)
  for (const path of [
    '/trainers',
    `/trainers/${fixture.trainerA.slug}`,
    '/coach/apply',
    '/coaching',
    '/notifications',
  ]) await auditRoute(page, path)

  await signIn(page, fixture.trainerA.email)
  const coachWorkspace = page.locator('button:visible[name="workspace"][value="coach"]').first()
  await expect(coachWorkspace).toBeVisible()
  await coachWorkspace.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/coach$/, { timeout: 30_000 })
  await expect(page.locator('a:visible[href="/coach/clients"]').first()).toBeVisible()
  await expect(page.locator('a:visible[href="/trainers"]')).toHaveCount(0)
  for (const path of [
    '/coach',
    '/coach/requests',
    `/coach/programs/${templateId}`,
    `/coach/clients/${fixture.client.id}`,
  ]) await auditRoute(page, path)

  await signIn(page, fixture.admin.email)
  await auditRoute(page, `/admin/trainers/${fixture.trainerA.applicationId}`)
})

test('workspace administrativo replaces product navigation and keeps feature routes accessible', async ({ page }) => {
  test.setTimeout(300_000)
  if (!fixture) throw new Error('Trainer accessibility fixture was not created')

  await signIn(page, fixture.admin.email)
  await page.goto('/settings')
  await page.getByRole('link', { name: 'Administración', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)

  const adminNav = page.locator('nav[aria-label="Navegación administrativa"]:visible')
  await expect(adminNav).toBeVisible()
  await expect(page.locator('nav[aria-label="Navegación principal"]:visible')).toHaveCount(0)
  await expect(page.getByText('Estado general de la plataforma', { exact: true })).toBeVisible()
  await auditCriticalAndSeriousAccessibility(page)
  await expectResponsiveGeometry(page)
  await expectActionTargetsAtLeast44(page)

  for (const destination of [
    { label: 'Usuarios', path: '/admin/users' },
    { label: 'Entrenadores', path: '/admin/trainers' },
    { label: 'Contenido', path: '/admin/content' },
  ]) {
    await page.locator('nav[aria-label="Navegación administrativa"]:visible')
      .getByRole('link', { name: destination.label, exact: true })
      .click()
    expect(new URL(page.url()).pathname).toBe(destination.path)
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('nav[aria-label="Navegación principal"]:visible')).toHaveCount(0)
    await expect(page.locator(`a[aria-current="page"][href="${destination.path}"]:visible`)).toBeVisible()
    await auditCriticalAndSeriousAccessibility(page)
    await expectResponsiveGeometry(page)
    await expectActionTargetsAtLeast44(page)
  }

  await auditRoute(page, `/admin/trainers/${fixture.trainerA.applicationId}`)
  await expect(page.locator('nav[aria-label="Navegación principal"]:visible')).toHaveCount(0)
  await expect(page.locator('a[aria-current="page"][href="/admin/trainers"]:visible')).toBeVisible()
  await page.getByRole('link', { name: /Volver a Vekira|Salir a Vekira/ }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('trainer journeys expose keyboard focus, associated errors, dialogs, and reduced motion', async ({ page }) => {
  test.setTimeout(180_000)
  if (!fixture || !templateId) throw new Error('Trainer accessibility fixture was not prepared')

  await signIn(page, fixture.client.email)
  await page.goto('/trainers')
  const profileLink = page.locator(`a[href="/trainers/${fixture.trainerA.slug}"]`)
  await profileLink.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/trainers/${fixture.trainerA.slug}$`))
  await expect(page.getByRole('heading', { level: 1, name: fixture.trainerA.professionalName })).toBeFocused()

  await page.goto('/coach/apply')
  await page.getByRole('button', { name: 'Revisar y enviar', exact: true }).click()
  const professionalName = page.getByLabel('Nombre profesional', { exact: true })
  await expect(professionalName).toBeFocused()
  await expect(professionalName).toHaveAttribute('aria-invalid', 'true')
  const errorId = await professionalName.getAttribute('aria-describedby')
  expect(errorId).toContain('professionalName-error')
  await expect(page.locator('#professionalName-error')).toBeVisible()

  await signIn(page, fixture.trainerA.email)
  await page.goto(`/coach/programs/${templateId}`)
  let dialogSeen = false
  page.once('dialog', async dialog => {
    dialogSeen = dialog.type() === 'confirm'
    await dialog.dismiss()
  })
  const archive = page.getByRole('button', { name: 'Archivar plantilla', exact: true })
  await archive.focus()
  await page.keyboard.press('Enter')
  expect(dialogSeen).toBe(true)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expectReducedMotionAndSafeArea(page)
})
