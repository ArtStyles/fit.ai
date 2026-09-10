import { chromium, expect } from '@playwright/test'
import { loadEnv } from 'vite'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { installAccountFixture, newTestAccount, storedAccountSnapshot } from './account-fixture.mjs'

const origin = process.env.MOBILE_PREVIEW_URL || 'http://127.0.0.1:4178'
const backend = new URL(loadEnv('production', 'mobile').VITE_SUPABASE_URL).origin
const artifacts = '.artifacts/coaching-fix'
const now = new Date('2026-09-09T16:00:00.000Z')
const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const trainerId = id(20), relationshipId = id(21), serviceId = id(22)
const assignmentId = id(23), versionId = id(24), planId = id(25), workoutId = id(26)
const title = 'Fuerza guiada de septiembre'
const workoutTitle = 'Entrenamiento del miércoles'
const note = 'Prioriza la técnica y mantén el movimiento controlado.'
const trainerName = 'Marina Pérez'
const errors = [], unexpectedRequests = [], backendRequests = [], measurements = []

const state = await newTestAccount()
Object.assign(state.tables.profiles[0], {
  full_name: 'Prueba acompañamiento', username: 'prueba_acompanamiento',
  onboarding_done: true, readiness_status: 'cleared', timezone: 'UTC',
  preferred_workout_days: [3], days_per_week: 1, readiness_screening: {},
  age: 30, gender: 'male', weight_kg: 75, height_cm: 175,
  last_check_in_at: now.toISOString(), created_at: now.toISOString(), updated_at: now.toISOString(),
})
const relationship = {
  id: relationshipId, status: 'active', client_user_id: state.accountId,
  trainer_user_id: trainerId, service_id: serviceId,
  started_at: '2026-09-05T12:00:00.000Z', source_request_id: id(30),
}
const exercise = state.tables.exercises[0]
state.tables.workout_plans = [{
  id: planId, family_id: planId, user_id: state.accountId, name: title,
  description: 'Rutina preparada por tu entrenadora', goal: 'Fuerza', week_number: 1,
  is_active: true, prescription_locked: true, trainer_assignment_id: assignmentId,
  trainer_assignment_version_id: versionId, library_slot: 'trainer',
  days_per_week: 1, gym_type: 'full_gym', fitness_level: 'beginner',
  retired_at: null, superseded_at: null, created_at: now.toISOString(), updated_at: now.toISOString(),
}]
state.tables.workouts = [{
  id: workoutId, plan_id: planId, user_id: state.accountId, name: workoutTitle,
  focus: 'Fuerza', day_of_week: 3, order_in_plan: 1, estimated_duration_minutes: 30,
  created_at: now.toISOString(),
}]
state.tables.workout_exercises = [{
  id: id(27), workout_id: workoutId, exercise_id: exercise.id, order_index: 1,
  sets: 1, reps: 8, rest_seconds: 60, target_rpe: 7, weight_kg: null,
  duration_seconds: null, notes: null, weight_suggestion_basis: null,
}]
state.tables.coaching_relationships = [relationship]
// Deliberately emulate a prior APK: this saved account has no consent or summary cache.
delete state.tables.coaching_consents
delete state.tables.mobile_coaching_summary
state.tables.session_authorizations = []

const snapshot = {
  schemaVersion: 1, name: title, goal: 'Fuerza', description: null, daysPerWeek: 1,
  workouts: [{ sourceTemplateWorkoutId: id(28), name: workoutTitle, dayOfWeek: 3, orderInPlan: 1,
    exercises: [{ sourceTemplateExerciseId: id(29), exerciseId: exercise.id, orderIndex: 1,
      sets: 1, reps: 8, weightKg: null, targetRpe: 7, restSeconds: 60, notes: null }],
  }],
}
const assignment = {
  id: assignmentId, trainer_user_id: trainerId, client_user_id: state.accountId,
  relationship_id: relationshipId, active_version_id: versionId, status: 'active', created_at: now.toISOString(),
  trainer_assignment_versions: [
    { id: id(31), version_number: 1, status: 'superseded', snapshot: { ...snapshot, name: 'Versión anterior de la rutina' }, change_summary: 'Nota antigua' },
    { id: versionId, version_number: 2, status: 'active', snapshot, change_summary: note },
  ],
}
state.tables.trainer_plan_assignments = [{ ...assignment, trainer_assignment_versions: undefined }]
state.tables.trainer_assignment_versions = assignment.trainer_assignment_versions.map(version => ({ ...version, assignment_id: assignmentId }))

const user = {
  id: state.accountId, aud: 'authenticated', role: 'authenticated', email: state.email,
  email_confirmed_at: now.toISOString(), created_at: now.toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [],
}
const expiresAt = Math.floor(now.getTime() / 1000) + 3600
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiresAt, iat: expiresAt - 3600 })}.fixture-signature`
const session = { access_token: accessToken, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user }

const tables = {
  coaching_relationships: [relationship],
  coaching_requests: [
    { id: id(30), trainer_user_id: trainerId, client_user_id: state.accountId, service_id: serviceId, status: 'accepted', created_at: '2026-09-04T12:00:00.000Z' },
    { id: id(32), trainer_user_id: trainerId, client_user_id: state.accountId, service_id: serviceId, status: 'accepted', created_at: '2026-08-31T12:00:00.000Z' },
  ],
  public_profiles: [{ id: trainerId, full_name: trainerName, username: 'marina', avatar_url: null }],
  active_trainer_directory: [{ user_id: trainerId, slug: 'marina-perez' }],
  coaching_consents: [{ id: id(33), relationship_id: relationshipId, scope: 'training_profile', text_version: 'training-profile-v1', granted_at: '2026-09-05T12:00:00.000Z', revoked_at: null }],
  trainer_plan_assignments: [assignment],
}

await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true })
let page
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  await context.addInitScript(() => {
    window.testOnline = sessionStorage.getItem('coaching-fixture-offline') !== '1'
    Object.defineProperty(navigator, 'onLine', { get: () => window.testOnline })
  })
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.origin === origin) return route.continue()
    if (url.origin !== backend) return route.abort()
    const fulfill = (body, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(body),
      headers: { 'access-control-allow-origin': origin, 'access-control-allow-headers': '*' },
    })
    if (request.method() === 'OPTIONS') return fulfill(null)
    backendRequests.push({ method: request.method(), path: url.pathname, select: url.searchParams.get('select') })
    if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return fulfill(user)
    if (url.pathname === '/rest/v1/rpc/get_requestable_trainer_services' && request.method() === 'POST') {
      return fulfill([{ service_id: serviceId, name: 'Acompañamiento de fuerza', description: 'Entrenamiento personalizado', modality: 'online', duration_minutes: 45, content: null }])
    }
    const table = url.pathname.replace('/rest/v1/', '')
    if (request.method() === 'GET' && Object.hasOwn(tables, table)) {
      const selection = url.searchParams.get('select') ?? ''
      if (table === 'trainer_plan_assignments' && selection.includes('trainer_assignment_versions(')) {
        return fulfill({ code: 'PGRST201', message: 'More than one relationship found' }, 300)
      }
      return fulfill(tables[table])
    }
    unexpectedRequests.push({ method: request.method(), path: url.pathname })
    return fulfill({ code: 'TEST_UNEXPECTED_REQUEST', message: 'Unconfigured fixture request' }, 418)
  })
  page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => errors.push(error.message))
  await page.clock.setFixedTime(now)
  await page.goto(`${origin}/login`)
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
  await installAccountFixture(page, state)
  await page.evaluate(session => localStorage.setItem('vekira-original-auth', JSON.stringify(session)), session)

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
    await page.goto(`${origin}/dashboard`)
    await expect(page.getByText('1 rutina en tu lista', { exact: true })).toBeVisible()
    await expect(page.getByText('Acompañamiento de fuerza', { exact: true })).toBeVisible()
    await expect(page.getByText('Falta autorizar tus datos de entrenamiento', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Completar autorización', exact: true })).toHaveCount(0)
    await page.screenshot({ path: `${artifacts}/dashboard-${width}.png`, fullPage: true })

    await page.goto(`${origin}/coaching`)
    await expect(page.getByRole('heading', { name: 'Acompañamiento', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    await expect(page.getByText('Autorizados', { exact: true })).toBeVisible()
    await expect(page.getByText('Privadas', { exact: true })).toBeVisible()
    await expect(page.getByText('No se pudieron cargar tus rutinas asignadas.', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Versión anterior de la rutina', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Autorizar datos de entrenamiento', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Revocar datos de entrenamiento', exact: true })).not.toBeVisible()
    const measure = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      routinesTop: document.getElementById('assigned-routines-title').getBoundingClientRect().top,
      permissionsTop: document.getElementById('consent-manager-title').getBoundingClientRect().top,
      openDetails: document.querySelectorAll('main details[open]').length,
    }))
    measurements.push({ width, ...measure })
    assert.ok(measure.overflow <= 1, `Coaching ${width}px has horizontal overflow`)
    assert.ok(measure.routinesTop < measure.permissionsTop, 'Assigned routines must precede permission management')
    assert.equal(measure.openDetails, 0, 'Notes, request history and management start collapsed')
    await page.screenshot({ path: `${artifacts}/coaching-${width}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByText('Nota del entrenador', { exact: true }).click()
  await expect(page.getByText(note, { exact: true })).toBeVisible()
  await page.getByText('Gestionar datos compartidos', { exact: true }).click()
  await expect(page.getByText('Autorización activa', { exact: true })).toBeVisible()
  await page.screenshot({ path: `${artifacts}/coaching-details-390.png`, fullPage: true })
  console.log('PASS original dashboard and coaching agree on active consent; assigned version loads and mobile/desktop hierarchy stays compact')

  const cached = (await storedAccountSnapshot(page)).accounts[0]
  assert.equal(cached.tables.coaching_consents, undefined, 'The previous APK fixture retains its missing consent table')
  await page.evaluate(() => {
    sessionStorage.setItem('coaching-fixture-offline', '1')
    window.testOnline = false
  })
  const requestsBeforeOffline = backendRequests.length
  await page.goto(`${origin}/dashboard`)
  await expect(page.getByText('1 rutina en tu lista', { exact: true })).toBeVisible()
  await expect(page.getByText('Falta autorizar tus datos de entrenamiento', { exact: true })).toHaveCount(0)
  assert.equal(backendRequests.length, requestsBeforeOffline, 'Cached dashboard does not require a remote consent check offline')
  await page.getByRole('link', { name: 'Empezar entrenamiento', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${workoutId}$`))
  await expect(page.getByRole('button', { name: 'Completar serie 1', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: workoutTitle, exact: true })).toBeVisible()
  const authorized = (await storedAccountSnapshot(page)).accounts[0]
  assert.equal(authorized.tables.session_authorizations.length, 1)
  const frozenPlan = authorized.tables.session_authorizations[0].session_context_snapshot.plan
  assert.equal(frozenPlan.prescriptionLocked, true)
  assert.equal(frozenPlan.trainerAssignmentId, assignmentId)
  assert.equal(frozenPlan.trainerAssignmentVersionId, versionId)
  assert.deepEqual(authorized.tables.workout_exercises, state.tables.workout_exercises)
  await page.screenshot({ path: `${artifacts}/trainer-session-390.png`, fullPage: true })
  console.log('PASS verified coaching summary survives offline and original trainer session starts with its locked prescription intact')

  assert.deepEqual(unexpectedRequests, [])
  assert.deepEqual(errors, [])
  assert.ok(backendRequests.some(request => request.select?.includes('trainer_assignment_versions!trainer_assignment_versions_assignment_id_fkey(')))
  await writeFile(`${artifacts}/report.json`, JSON.stringify({
    passed: true, measurements, cases: ['old downloaded account refreshes consent from connected backend', 'dashboard and coaching permission agreement', 'unambiguous assignment version relation', 'active version selected from historical and current versions', '390/1440 responsive hierarchy', 'collapsed management, notes and history', 'verified summary retained offline', 'trainer session starts offline with original prescription lock'],
    backendRequests, unexpectedRequests, pageErrors: errors,
  }, null, 2))
} catch (error) {
  await page?.screenshot({ path: `${artifacts}/failure.png`, fullPage: true }).catch(() => {})
  await writeFile(`${artifacts}/failure.json`, JSON.stringify({ error: String(error), backendRequests, unexpectedRequests, pageErrors: errors }, null, 2))
  throw error
} finally { await browser.close() }
