import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { expectProfessionalPlanReadOnly } from './helpers/acceptance'
import {
  cleanupTrainerSecurityPublishedFixtures,
  isTrainerMarketplaceE2EEnabled,
  assertTrainerSecurityRemoteReady,
  suspendReinstateAndResumeThroughAuthenticatedAdmin,
} from './helpers/trainer-marketplace'
import {
  createTrainerE2EAdminClient,
  deriveTrainerRelationshipScope,
  seedTrainerProgrammingFixture,
  seedTrainerRelationshipsFixture,
  type TrainerProgrammingFixture,
  type TrainerRelationshipsFixture,
} from './helpers/core-product'

test.describe.configure({ mode: 'serial' })

type Applicant = { id: string; email: string; client: SupabaseClient }

function noError(error: { message?: string } | null, operation: string): void {
  if (error) throw new Error(`${operation} failed: ${error.message ?? 'unknown error'}`)
}

async function createApplicant(fixture: TrainerRelationshipsFixture, password: string): Promise<Applicant> {
  const email = `e2e-${fixture.runId}-${randomUUID().slice(0, 8)}-applicant@example.test`
  const created = await fixture.service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { e2e_run_id: fixture.runId, trainer_marketplace_role: 'applicant' },
  })
  noError(created.error, 'creating marketplace applicant')
  if (!created.data.user) throw new Error('Marketplace applicant creation returned no user')
  fixture.created.userIds.push(created.data.user.id)
  const { error } = await (fixture.service.from('profiles') as any).upsert({
    id: created.data.user.id,
    username: `marketplace_applicant_${randomUUID().slice(0, 8)}`,
    full_name: 'E2E Marketplace Applicant',
    onboarding_done: true,
    account_status: 'active',
    language: 'es',
    timezone: 'America/Havana',
    avatar_url: 'https://images.example.test/trainer-marketplace.jpg',
  })
  noError(error, 'preparing marketplace applicant profile')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new Error('Marketplace applicant auth configuration is unavailable')
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const signedIn = await client.auth.signInWithPassword({ email, password })
  noError(signedIn.error, 'signing in marketplace applicant client')
  return { id: created.data.user.id, email, client }
}

async function connectApprovedApplicantAsTrainer(
  fixture: TrainerRelationshipsFixture,
  applicant: Applicant,
  applicationId: string,
): Promise<void> {
  const { data: profile, error: profileError } = await (fixture.service.from('trainer_profiles') as any)
    .select('id,slug,professional_name,status').eq('user_id', applicant.id).eq('source_application_id', applicationId).maybeSingle()
  noError(profileError, 'reading the approved applicant trainer profile')
  if (!profile || profile.status !== 'active') throw new Error('Approved applicant did not become an active trainer')
  const serviceId = randomUUID()
  const { error: serviceError } = await (applicant.client.from('trainer_service_offerings') as any).insert({
    id: serviceId,
    trainer_profile_id: profile.id,
    name: `Marketplace free coaching ${fixture.runId}`,
    description: 'Free pilot coaching connected to the administratively verified trainer.',
    modality: 'online',
    duration_minutes: 45,
    content: 'Professional routine and weekly follow-up.',
    capacity: 5,
    is_active: true,
    billing_mode: 'free_preview',
    price_minor: null,
    currency: null,
    billing_interval: null,
  })
  noError(serviceError, 'creating the approved applicant free service')
  fixture.created.applicationIds.push(applicationId)
  fixture.created.profileIds.push(profile.id)
  fixture.created.serviceIds.push(serviceId)
  fixture.trainerA = {
    id: applicant.id,
    email: applicant.email,
    client: applicant.client,
    applicationId,
    profileId: profile.id,
    serviceId,
    slug: profile.slug,
    professionalName: profile.professional_name,
  }
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
}

async function requestCoachingThroughBrowser(page: Page, slug: string, message: string): Promise<void> {
  await page.goto(`/trainers/${slug}`)
  const form = page.locator('form').filter({ has: page.getByRole('heading', { name: 'Solicitar acompañamiento', exact: true }) })
  await form.getByLabel('Mensaje opcional', { exact: true }).fill(message)
  await form.getByRole('checkbox').check()
  await form.getByRole('button', { name: 'Enviar solicitud', exact: true }).click()
  await expect(form.getByText('Tu solicitud quedó pendiente de respuesta.', { exact: true })).toBeVisible()
}

async function assertPilotExclusions(page: Page): Promise<void> {
  await expect(page.locator('a[href^="/feed"], a[href^="/checkout"], a[href^="/messages"], a[href^="/coach/messages"], a[href*="/reviews"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Comunidad', exact: true })).toHaveCount(0)
  await expect(page.getByText(/checkout|pagar ahora|precio mensual|reseñas de clientes|mensajería privada/i)).toHaveCount(0)
}

async function submitApplication(page: Page): Promise<void> {
  await page.goto('/coach/apply')
  await page.getByLabel('Nombre profesional', { exact: true }).fill('Entrenadora Marketplace E2E')
  await page.getByLabel('Biografía profesional', { exact: true }).fill('Entrenadora de fuerza y movilidad con acompañamiento progresivo, seguro y verificable.')
  await page.getByLabel('Especialidades', { exact: true }).fill('Fuerza, movilidad')
  await page.getByLabel('En línea', { exact: true }).check()
  await page.getByLabel('Experiencia', { exact: true }).fill('Ocho años guiando entrenamiento de fuerza y movilidad para personas adultas.')
  await page.getByLabel('Correo de contacto', { exact: true }).fill('marketplace-applicant@example.test')
  await page.getByLabel('Zona horaria', { exact: true }).fill('America/Havana')
  await page.getByLabel('Disponibilidad para entrevista', { exact: true }).fill('Lunes a viernes después de las 14:00.')
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  await expect(page.getByText('Borrador guardado.', { exact: true })).toBeVisible()
  await page.getByLabel('Título de la credencial', { exact: true }).fill('Certificación Marketplace E2E')
  await page.getByRole('textbox', { name: 'Enlace HTTPS', exact: true }).fill('https://credentials.example.test/marketplace-e2e')
  await page.getByRole('button', { name: 'Agregar credencial', exact: true }).click()
  await page.getByRole('button', { name: 'Revisar y enviar', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar y enviar', exact: true }).click()
  await expect(page.getByText('Solicitud enviada.', { exact: false })).toBeVisible()
}

async function reviewActions(page: Page): Promise<Locator> {
  const actions = page.locator('details', { has: page.getByText('Gestionar revisión', { exact: true }) })
  if ((await actions.getAttribute('open')) === null) await actions.locator('summary').click()
  await expect(actions).toHaveAttribute('open', '')
  return actions
}

async function requestChanges(adminPage: Page): Promise<void> {
  let actions = await reviewActions(adminPage)
  await actions.getByRole('button', { name: 'Iniciar revisión', exact: true }).click()
  await expect(adminPage.getByText('Revision iniciada.', { exact: true })).toBeVisible()
  await adminPage.reload()
  actions = await reviewActions(adminPage)
  const form = actions.locator('form').filter({ hasText: 'Solicitar cambios' })
  await form.getByLabel('Nota pública obligatoria', { exact: true }).fill('Amplía la experiencia profesional verificable.')
  await form.getByRole('button', { name: 'Solicitar cambios', exact: true }).click()
  await expect(adminPage.getByText('Cambios solicitados.', { exact: true })).toBeVisible()
}

async function interviewAndApprove(adminPage: Page): Promise<void> {
  await adminPage.reload()
  let actions = await reviewActions(adminPage)
  await actions.getByRole('button', { name: 'Iniciar revisión', exact: true }).click()
  await adminPage.reload()
  actions = await reviewActions(adminPage)
  const schedule = actions.locator('form').filter({ hasText: 'Programar entrevista' })
  const proposedAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
  await schedule.locator('input[name="proposedAt"]').fill(proposedAt)
  await schedule.locator('input[name="externalUrl"]').fill('https://meet.example.test/marketplace-e2e')
  await schedule.locator('textarea[name="publicNote"]').fill('Entrevista técnica coordinada por contacto externo.')
  await schedule.getByRole('button', { name: 'Programar entrevista', exact: true }).click()
  await expect(adminPage.getByText('Entrevista programada.', { exact: true })).toBeVisible()
  await adminPage.reload()
  actions = await reviewActions(adminPage)
  const outcome = actions.locator('form').filter({ hasText: 'Registrar resultado' })
  await outcome.locator('select[name="interviewStatus"]').selectOption('completed')
  await outcome.locator('input[name="outcome"]').fill('Entrevista técnica completada satisfactoriamente.')
  await outcome.locator('textarea[name="publicNote"]').fill('Entrevista completada.')
  await outcome.getByRole('button', { name: 'Registrar resultado', exact: true }).click()
  await expect(adminPage.getByText('Resultado registrado.', { exact: true })).toBeVisible()
  await adminPage.reload()
  actions = await reviewActions(adminPage)
  await actions.getByRole('button', { name: 'Aprobar solicitud', exact: true }).click()
  await expect(adminPage.getByText('Aprobacion guardada.', { exact: true })).toBeVisible()
}

test('gates the complete persisted trainer marketplace journey and pilot exclusions', async ({ page, browser }, testInfo) => {
  if (!isTrainerMarketplaceE2EEnabled(process.env)) {
    throw new Error('Trainer marketplace E2E requires the dedicated-project gate, disabled exclusions, and no payment credentials')
  }
  test.setTimeout(900_000)

  // This is deliberately the only remote operation before the first fixture
  // write. The database function validates the complete 042-045 contract and
  // must return exactly 45; an outdated remote fails here, never as a skip.
  const service = createTrainerE2EAdminClient()
  await assertTrainerSecurityRemoteReady(service)
  const scope = deriveTrainerRelationshipScope({
    projectName: `${testInfo.project.name}-marketplace`,
    workerIndex: testInfo.workerIndex,
    parallelIndex: testInfo.parallelIndex,
    retry: testInfo.retry,
  })
  const password = process.env.E2E_USER_PASSWORD
  if (!password) throw new Error('Marketplace E2E password is unavailable after configuration validation')
  let cleanupFixture: TrainerRelationshipsFixture | undefined
  let journeyFailure: unknown
  let cleanupFailure: unknown
  let journeyCompleted = false

  try {
    // Register a fully reversible user scope before any immutable publication.
    // If programming later throws, cleanup still has every exact run-marked ID.
    const relationships = await seedTrainerRelationshipsFixture(scope, { skipReadiness: true })
    cleanupFixture = relationships
    const applicant = await createApplicant(relationships, password)
    await signIn(page, applicant.email, password)
    await submitApplication(page)
    await assertPilotExclusions(page)
    const { data: application, error: applicationError } = await (relationships.service.from('trainer_applications') as any)
      .select('id,status,contact_email,interview_availability').eq('user_id', applicant.id).maybeSingle()
    noError(applicationError, 'reading submitted marketplace application')
    if (!application?.id) throw new Error('Submitted marketplace application has no persisted ID')
    expect(application.status).toBe('submitted')

    const adminContext = await browser.newContext()
    const adminPage = await adminContext.newPage()
    try {
      await signIn(adminPage, relationships.admin.email, password)
      await adminPage.goto(`/admin/trainers/${application.id}`)
      await requestChanges(adminPage)
      await assertPilotExclusions(adminPage)
      await page.reload()
      await page.getByLabel('Experiencia', { exact: true }).fill('Ocho años guiando fuerza y movilidad con evaluación inicial documentada.')
      await page.getByRole('button', { name: 'Revisar y enviar', exact: true }).click()
      await page.getByRole('button', { name: 'Confirmar y enviar', exact: true }).click()
      await interviewAndApprove(adminPage)
    } finally {
      await adminContext.close()
    }
    const { data: reviewed, error: reviewedError } = await (relationships.service.from('trainer_applications') as any)
      .select('status').eq('id', application.id).maybeSingle()
    noError(reviewedError, 'reading approved marketplace application')
    expect(reviewed?.status).toBe('approved')
    const { data: interview, error: interviewError } = await (relationships.service.from('trainer_interviews') as any)
      .select('status,outcome,external_url').eq('application_id', application.id).maybeSingle()
    noError(interviewError, 'reading recorded technical interview')
    expect(interview).toMatchObject({ status: 'completed', external_url: 'https://meet.example.test/marketplace-e2e' })
    expect(interview?.outcome).toEqual(expect.any(String))

    // The actor approved above is the exact trainer carried through service,
    // discovery, relationship, programming, evidence and suspension below.
    await connectApprovedApplicantAsTrainer(relationships, applicant, application.id)
    await page.context().clearCookies()
    await signIn(page, relationships.client.email, password)
    await page.goto('/trainers')
    await expect(page.getByText(relationships.trainerA.professionalName, { exact: true })).toBeVisible()
    await assertPilotExclusions(page)
    await page.goto(`/trainers/${relationships.trainerA.slug}`)
    await expect(page.getByRole('heading', { name: relationships.trainerA.professionalName, exact: true })).toBeVisible()
    await assertPilotExclusions(page)
    const { data: freeService, error: serviceError } = await (relationships.service.from('trainer_service_offerings') as any)
      .select('billing_mode,price_minor,currency,billing_interval').eq('id', relationships.trainerA.serviceId).maybeSingle()
    noError(serviceError, 'reading free marketplace service')
    expect(freeService).toEqual({
      billing_mode: 'free_preview', price_minor: null, currency: null, billing_interval: null,
    })

    // The client creates both open requests through the rendered server-action
    // forms. Trainer A then accepts through its queue; the browser, not fixture
    // RPC setup, creates the relationship and the basic consent grant.
    await requestCoachingThroughBrowser(page, relationships.trainerA.slug, 'Quiero trabajar fuerza con seguimiento semanal.')
    await requestCoachingThroughBrowser(page, relationships.trainerB.slug, 'También quiero comparar este servicio profesional.')
    await page.context().clearCookies()
    await signIn(page, relationships.trainerA.email, password)
    await page.goto('/coach/requests')
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Aceptar', exact: true }).first().click()
    await expect(page.getByText('La solicitud fue aceptada.', { exact: true })).toBeVisible()

    await page.context().clearCookies()
    await signIn(page, relationships.client.email, password)
    await page.goto('/coaching')
    await expect(page.getByRole('heading', { name: 'Acompañamiento activo', exact: true })).toBeVisible()
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Autorizar medidas corporales', exact: true }).click()
    await expect(page.getByText('Tu consentimiento fue actualizado.', { exact: true })).toBeVisible()

    const { data: persistedRequests, error: persistedRequestsError } = await (relationships.service.from('coaching_requests') as any)
      .select('id,status').eq('client_user_id', relationships.client.id).order('created_at')
    noError(persistedRequestsError, 'reading browser-created coaching requests')
    const requestRows = persistedRequests ?? []
    relationships.created.requestIds.push(...requestRows.map((row: { id: string }) => row.id))
    const { data: persistedRelationship, error: persistedRelationshipError } = await (relationships.service.from('coaching_relationships') as any)
      .select('id,status').eq('client_user_id', relationships.client.id).eq('status', 'active').maybeSingle()
    noError(persistedRelationshipError, 'reading browser-created coaching relationship')
    if (!persistedRelationship?.id) throw new Error('Browser acceptance did not persist an active relationship')
    relationships.created.relationshipIds.push(persistedRelationship.id)
    const { data: persistedConsents, error: persistedConsentsError } = await (relationships.service.from('coaching_consents') as any)
      .select('id,scope,revoked_at').eq('relationship_id', persistedRelationship.id)
    noError(persistedConsentsError, 'reading browser-created coaching consents')
    relationships.created.consentIds.push(...(persistedConsents ?? []).map((row: { id: string }) => row.id))
    expect(persistedConsents).toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'training_profile', revoked_at: null }),
      expect.objectContaining({ scope: 'body_measurements', revoked_at: null }),
    ]))
    expect(requestRows?.filter((row: { status: string }) => row.status === 'accepted')).toHaveLength(1)
    expect(requestRows?.filter((row: { status: string }) => row.status === 'cancelled')).toHaveLength(1)

    const fixture: TrainerProgrammingFixture = await seedTrainerProgrammingFixture(scope, {
      skipReadiness: true,
      relationshipsFixture: relationships,
      existingRelationshipId: persistedRelationship.id,
    })

    const proposal = await fixture.createTemplateAndPropose('Marketplace Professional V1')
    await page.goto('/coaching')
    await expect(page.getByRole('heading', { name: 'Rutina profesional propuesta', exact: true })).toBeVisible()
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Aceptar rutina', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Rutina activada')
    await page.goto('/plan')
    await expectProfessionalPlanReadOnly(page)
    await assertPilotExclusions(page)

    const authorization = await fixture.authorizeCurrentProfessionalSession()
    const revisions = await Promise.all([
      fixture.publishRevision('Marketplace Professional V2 A', 'Ajuste concurrente A'),
      fixture.publishRevision('Marketplace Professional V2 B', 'Ajuste concurrente B'),
    ])
    expect(new Set(revisions.map(revision => revision.versionNumber)).size).toBe(2)
    const saved = await fixture.saveAuthorizedSessionWithActualResults(authorization)
    expect(saved.progressLogCount).toBe(1)
    expect(saved.exerciseLogCount).toBe(2)
    expect((await fixture.readAuthorizedSession(authorization.clientSessionId)).assignmentVersionId)
      .toBe(proposal.assignmentVersionId)

    const measurementWeightKg = 72.4
    const { error: measurementError } = await (fixture.service.from('measurements') as any).insert({
      id: randomUUID(), user_id: fixture.client.id, recorded_at: new Date().toISOString(), weight_kg: measurementWeightKg,
    })
    noError(measurementError, 'creating consent-bound marketplace measurement')
    const visibleMeasurement = await (fixture.trainerA.client.rpc as any)('get_coach_client_measurements', {
      p_client_id: fixture.client.id, p_from_date: '2020-01-01', p_to_date: '2035-01-01',
    })
    noError(visibleMeasurement.error, 'reading consent-bound marketplace measurement')
    expect(JSON.stringify(visibleMeasurement.data)).toContain(String(measurementWeightKg))
    await page.goto('/coaching')
    page.once('dialog', dialog => dialog.accept())
    await page.getByRole('button', { name: 'Revocar medidas corporales', exact: true }).click()
    await expect(page.getByText('Tu consentimiento fue actualizado.', { exact: true })).toBeVisible()
    const revokedMeasurement = await (fixture.trainerA.client.rpc as any)('get_coach_client_measurements', {
      p_client_id: fixture.client.id, p_from_date: '2020-01-01', p_to_date: '2035-01-01',
    })
    expect(revokedMeasurement.error?.message).toBe('COACH_CLIENT_INSIGHTS_UNAVAILABLE')

    const resumedRelationshipId = await suspendReinstateAndResumeThroughAuthenticatedAdmin(fixture)
    const { data: resumed, error: resumedError } = await (fixture.service.from('coaching_relationships') as any)
      .select('status').eq('id', resumedRelationshipId).maybeSingle()
    noError(resumedError, 'reading explicitly resumed marketplace relationship')
    expect(resumed?.status).toBe('active')
    await page.goto('/coaching')
    await assertPilotExclusions(page)
    await page.goto('/feed')
    await expect(page).toHaveURL(/\/trainers$/)
    await expect(page.getByRole('link', { name: /nueva publicación|publicar/i })).toHaveCount(0)
    journeyCompleted = true
  } catch (error) {
    journeyFailure = error
  } finally {
    if (cleanupFixture) {
      const userIds = Array.from(new Set(cleanupFixture.created.userIds))
      const ids = userIds.join(',')
      const auditIds = async (table: 'professional_audit_logs' | 'admin_audit_logs', exactIds?: string[]): Promise<string[]> => {
        let query = (cleanupFixture!.service.from(table) as any).select('id')
        query = exactIds
          ? query.in('id', exactIds)
          : table === 'professional_audit_logs'
            ? query.or(`actor_user_id.in.(${ids}),subject_user_id.in.(${ids})`)
            : query.or(`admin_user_id.in.(${ids}),target_user_id.in.(${ids})`)
        const { data, error } = await query
        noError(error, `reading exact ${table}`)
        return (data ?? []).map((row: { id: string }) => row.id).sort()
      }
      type AdminAuditEvidence = {
        id: string
        action: string
        reason: string | null
        metadata: Record<string, unknown>
        created_at: string
        admin_user_id_snapshot: string | null
        target_user_id_snapshot: string | null
      }
      const adminAuditEvidence = async (exactIds?: string[]): Promise<AdminAuditEvidence[]> => {
        let query = (cleanupFixture!.service.from('admin_audit_logs') as any)
          .select('id,action,reason,metadata,created_at,admin_user_id_snapshot,target_user_id_snapshot')
        query = exactIds
          ? query.in('id', exactIds)
          : query.or(`admin_user_id.in.(${ids}),target_user_id.in.(${ids})`)
        const { data, error } = await query
        noError(error, 'reading immutable marketplace admin audit evidence')
        return (data ?? []).sort((left: AdminAuditEvidence, right: AdminAuditEvidence) => left.id.localeCompare(right.id))
      }
      let professionalBefore: string[] | undefined
      let adminBefore: string[] | undefined
      let adminEvidenceBefore: AdminAuditEvidence[] | undefined
      if (journeyCompleted) {
        try {
          const capturedProfessionalIds = await auditIds('professional_audit_logs')
          const capturedAdminEvidence = await adminAuditEvidence()
          const capturedAdminIds = capturedAdminEvidence.map(row => row.id)
          expect(capturedProfessionalIds.length).toBeGreaterThan(0)
          expect(capturedAdminIds.length).toBeGreaterThan(0)
          for (const row of capturedAdminEvidence) {
            const correlatedIds = [row.admin_user_id_snapshot, row.target_user_id_snapshot]
              .filter((value): value is string => typeof value === 'string')
            expect(correlatedIds.length).toBeGreaterThan(0)
            expect(correlatedIds.every(value => userIds.includes(value))).toBe(true)
          }
          professionalBefore = capturedProfessionalIds
          adminBefore = capturedAdminIds
          adminEvidenceBefore = capturedAdminEvidence
        } catch (error) {
          cleanupFailure = error
        }
      }
      try {
        await cleanupTrainerSecurityPublishedFixtures([cleanupFixture])
        if (professionalBefore && adminBefore && adminEvidenceBefore) {
          const expectedProfessionalIds = professionalBefore
          const expectedAdminIds = adminBefore
          const expectedAdminEvidence = adminEvidenceBefore
          expect(await auditIds('professional_audit_logs', expectedProfessionalIds)).toEqual(expectedProfessionalIds)
          expect(await auditIds('admin_audit_logs', expectedAdminIds)).toEqual(expectedAdminIds)
          expect(await adminAuditEvidence(expectedAdminIds)).toEqual(expectedAdminEvidence)
        }
      } catch (error) {
        cleanupFailure ??= error
      }
    }
  }
  if (journeyFailure && cleanupFailure) {
    throw new AggregateError([journeyFailure, cleanupFailure], 'Trainer marketplace journey and exact cleanup both failed')
  }
  if (journeyFailure) throw journeyFailure
  if (cleanupFailure) throw cleanupFailure
})
