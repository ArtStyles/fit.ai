import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { signInAsE2EUser } from './helpers/auth'
import { seedCoreProductFixture } from './helpers/core-product'
import { requireE2EConfig } from '../../scripts/seed-e2e-account'

type TrainerApplication = { id: string; status: string }

function assertNoError(error: { message?: string } | null, operation: string): void {
  if (error) throw new Error(`${operation} failed: ${error.message ?? 'unknown error'}`)
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
}

async function createAdminFixture(service: SupabaseClient, password: string): Promise<{ id: string; email: string }> {
  const email = `trainer-admin-${randomUUID()}@example.test`
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  assertNoError(error, 'Creating trainer verification admin')
  if (!data.user) throw new Error('Creating trainer verification admin did not return a user')

  try {
    const { error: profileError } = await (service.from('profiles') as any).upsert({
      id: data.user.id,
      onboarding_done: true,
      is_admin: true,
      account_status: 'active',
      language: 'es',
      timezone: 'America/Havana',
    })
    assertNoError(profileError, 'Granting trainer verification admin access')
  } catch (fixtureError) {
    const { error: cleanupError } = await service.auth.admin.deleteUser(data.user.id)
    if (cleanupError) {
      const message = fixtureError instanceof Error ? fixtureError.message : String(fixtureError)
      throw new Error(`${message}; deleting the partial admin fixture also failed: ${cleanupError.message}`)
    }
    throw fixtureError
  }

  return { id: data.user.id, email }
}

async function applicationFor(service: SupabaseClient, userId: string): Promise<TrainerApplication> {
  const { data, error } = await (service.from('trainer_applications') as any)
    .select('id, status')
    .eq('user_id', userId)
    .eq('application_kind', 'initial')
    .maybeSingle()
  assertNoError(error, 'Loading trainer verification application')
  if (!data) throw new Error('Trainer verification application was not created')
  return data as TrainerApplication
}

async function cleanTrainerFixture(service: SupabaseClient, userId: string, adminId: string | null): Promise<void> {
  const operations = [
    service.from('product_notifications').delete().eq('user_id', userId),
    service.from('trainer_profiles').delete().eq('user_id', userId),
    service.from('trainer_applications').delete().eq('user_id', userId),
  ]
  for (const operation of operations) {
    const { error } = await operation
    assertNoError(error, 'Cleaning trainer verification fixture')
  }
  if (adminId) {
    const { error } = await service.auth.admin.deleteUser(adminId)
    assertNoError(error, 'Deleting trainer verification admin')
  }
}

async function submitTrainerApplication(page: Page): Promise<void> {
  await page.goto('/coach/apply')
  await page.getByLabel('Nombre profesional', { exact: true }).fill('Entrenadora E2E')
  await page.getByLabel('Biografía profesional', { exact: true }).fill(
    'Entrenadora especializada en fuerza y movilidad con acompañamiento progresivo y seguro.',
  )
  await page.getByLabel('Especialidades', { exact: true }).fill('Fuerza, movilidad')
  await page.getByLabel('En línea', { exact: true }).check()
  await page.getByLabel('Experiencia', { exact: true }).fill(
    'Ocho años de experiencia guiando entrenamientos de fuerza para personas adultas.',
  )
  await page.getByLabel('Correo de contacto', { exact: true }).fill('trainer-e2e@example.test')
  await page.getByLabel('Zona horaria', { exact: true }).fill('America/Havana')
  await page.getByLabel('Disponibilidad para entrevista', { exact: true }).fill('Entre semana después de las 14:00.')
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()

  await page.getByLabel('Título de la credencial', { exact: true }).fill('Certificación E2E')
  await page.getByRole('textbox', { name: 'Enlace HTTPS', exact: true }).fill('https://credentials.example.test/e2e')
  await page.getByRole('button', { name: 'Agregar credencial', exact: true }).click()
  await expect(page.getByText('Certificación E2E', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Revisar y enviar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirma el envío', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Confirmar y enviar', exact: true }).click()
  await expect(page.getByText('Solicitud enviada.', { exact: false })).toBeVisible()
}

async function openTrainerReviewActions(adminPage: Page): Promise<Locator> {
  const actions = adminPage.locator('details', {
    has: adminPage.getByText('Gestionar revisión', { exact: true }),
  })
  await expect(actions).toBeVisible()
  if ((await actions.getAttribute('open')) === null) {
    await actions.locator('summary').click()
  }
  await expect(actions).toHaveAttribute('open', '')
  return actions
}

async function requestCorrection(adminPage: Page): Promise<void> {
  let actions = await openTrainerReviewActions(adminPage)
  const startReview = actions.getByRole('button', { name: 'Iniciar revisión', exact: true })
  await expect(startReview).toBeEnabled()
  await startReview.click()
  await expect(adminPage.getByText('Revision iniciada.', { exact: true })).toBeVisible()
  await adminPage.reload()
  actions = await openTrainerReviewActions(adminPage)
  const form = actions.locator('form').filter({ hasText: 'Solicitar cambios' })
  await form.getByLabel('Nota pública obligatoria', { exact: true }).fill('Amplía el detalle de la experiencia profesional.')
  const requestChanges = form.getByRole('button', { name: 'Solicitar cambios', exact: true })
  await expect(requestChanges).toBeEnabled()
  await requestChanges.click()
  await expect(adminPage.getByText('Cambios solicitados.', { exact: true })).toBeVisible()
}

async function scheduleInterviewAndApprove(adminPage: Page): Promise<void> {
  await adminPage.reload()
  let actions = await openTrainerReviewActions(adminPage)
  const startReview = actions.getByRole('button', { name: 'Iniciar revisión', exact: true })
  await expect(startReview).toBeEnabled()
  await startReview.click()
  await expect(adminPage.getByText('Revision iniciada.', { exact: true })).toBeVisible()
  await adminPage.reload()

  actions = await openTrainerReviewActions(adminPage)
  const interviewForm = actions.locator('form').filter({ hasText: 'Programar entrevista' })
  await interviewForm.locator('input[name="proposedAt"]').fill('2030-01-15T15:00')
  await interviewForm.locator('input[name="externalUrl"]').fill('https://meet.example.test/trainer-e2e')
  const scheduleInterview = interviewForm.getByRole('button', { name: 'Programar entrevista', exact: true })
  await expect(scheduleInterview).toBeEnabled()
  await scheduleInterview.click()
  await expect(adminPage.getByText('Entrevista programada.', { exact: true })).toBeVisible()
  await adminPage.reload()

  actions = await openTrainerReviewActions(adminPage)
  const approve = actions.getByRole('button', { name: 'Aprobar solicitud', exact: true })
  await expect(approve).toBeEnabled()
  await approve.click()
  await expect(adminPage.getByText('Aprobacion guardada.', { exact: true })).toBeVisible()
}

test('verifies a trainer, acknowledges approval, and opens the coach workspace', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const config = requireE2EConfig(process.env)
  const service = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const userId = await seedCoreProductFixture('es').then(fixture => fixture.userId)
  let adminId: string | null = null

  try {
    const { error: profileError } = await (service.from('profiles') as any)
      .update({ avatar_url: 'https://images.example.test/trainer-e2e.jpg' })
      .eq('id', userId)
    assertNoError(profileError, 'Adding trainer application profile photo')
    const admin = await createAdminFixture(service, config.password)
    adminId = admin.id

    await signInAsE2EUser(page)
    await submitTrainerApplication(page)
    const application = await applicationFor(service, userId)
    expect(application.status).toBe('submitted')

    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    await signIn(adminPage, admin.email, config.password)
    await adminPage.goto(`/admin/trainers/${application.id}`)
    await requestCorrection(adminPage)

    await page.reload()
    await expect(page.getByText('Cambios solicitados', { exact: true })).toBeVisible()
    await page.getByLabel('Experiencia', { exact: true }).fill(
      'Ocho años de experiencia guiando entrenamientos de fuerza y movilidad con evaluación inicial.',
    )
    await page.getByRole('button', { name: 'Revisar y enviar', exact: true }).click()
    await page.getByRole('button', { name: 'Confirmar y enviar', exact: true }).click()
    await expect(page.getByText('Solicitud enviada.', { exact: false })).toBeVisible()

    await scheduleInterviewAndApprove(adminPage)
    await adminContext.close()

    await page.goto('/notifications')
    await expect(page.getByRole('heading', { name: 'Solicitud aprobada', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Abrir: Solicitud aprobada', exact: true }).click()
    await expect(page).toHaveURL(/\/coach\/apply$/)

    const { data: notification, error: notificationError } = await (service.from('product_notifications') as any)
      .select('read_at')
      .eq('user_id', userId)
      .eq('title', 'Solicitud aprobada')
      .maybeSingle()
    assertNoError(notificationError, 'Loading approval notification')
    expect(notification?.read_at).toEqual(expect.any(String))

    await page.goto('/dashboard')
    const desktopSwitcher = page.getByRole('button', { name: 'Entrenador', exact: true })
    if (await desktopSwitcher.count()) {
      await desktopSwitcher.click()
    } else {
      await page.getByRole('button', { name: 'Cambiar al espacio Entrenador', exact: true }).click()
    }
    await expect(page).toHaveURL(/\/coach$/)
    await expect(page.getByRole('link', { name: 'Servicios', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Resumen', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Clientes', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Rutinas', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Solicitudes', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Perfil', exact: true })).toBeVisible()
  } finally {
    await cleanTrainerFixture(service, userId, adminId)
  }
})
