import type { SupabaseClient } from '@supabase/supabase-js'
import type { MobileAccount, MobileMeasurement, MobilePlan, MobileSession } from '../domain/types'
import type { CloudGateway } from './sync'
import type { TrainerCard } from './types'
import { mapAccount, mapPlan, mapSession, type Row } from './mapping'

const missing = (error: { code?: string } | null) => error?.code === 'PGRST202' || error?.code === '42P01' || error?.code === 'PGRST205'
export function cloudError(error: { code?: string; message?: string }): Error {
  if (missing(error)) return new Error('El respaldo móvil necesita habilitarse en el servidor. Tus datos siguen guardados en este dispositivo; exporta un respaldo desde Ajustes.')
  const messages: Record<string, string> = {
    COACHING_PENDING_REQUEST_EXISTS: 'Ya tienes una solicitud pendiente para este servicio.',
    COACHING_ACTIVE_RELATIONSHIP_EXISTS: 'Ya tienes una relación profesional activa.',
    COACHING_SERVICE_NOT_AVAILABLE: 'Este servicio ya no está disponible.',
    MOBILE_SYNC_OWNER_MISMATCH: 'La operación no pertenece a la cuenta conectada.',
    MOBILE_SYNC_CANONICAL_MISMATCH: 'La sesión no coincide con su rutina original. Conservamos el registro local para revisarlo.',
    MOBILE_SYNC_IDEMPOTENCY_MISMATCH: 'Hay un conflicto de identidad en este registro. Conservamos el respaldo local.',
    MOBILE_SYNC_VERSION_CONFLICT: 'Dos cambios tienen la misma fecha y distintos datos. Conservamos ambos respaldos para revisarlos.',
  }
  return new Error(messages[error.message ?? ''] ?? error.message ?? 'No se pudo conectar con Supabase.')
}

/** Pagination avoids silently cutting history at PostgREST's default 1,000-row cap. */
async function pages(makeQuery: () => any): Promise<Row[]> {
  const result: Row[] = []
  for (let offset = 0; ; offset += 500) {
    const response = await makeQuery().range(offset, offset + 499)
    if (response.error) throw cloudError(response.error)
    const rows = response.data ?? []
    result.push(...rows)
    if (rows.length < 500) return result
  }
}
export function createSupabaseGateway(client: SupabaseClient, clearStoredAuth: () => void = () => {}, beginSignIn: () => void = () => {}): CloudGateway {
  let signedOut = false
  async function currentUser(): Promise<string> {
    if (signedOut) throw new Error('Inicia sesión para conectar esta cuenta.')
    const { data, error } = await client.auth.getUser()
    if (error || !data.user) throw new Error('Tu conexión expiró. Inicia sesión otra vez cuando tengas internet.')
    return data.user.id
  }
  const requestKeys = new Map<string, string>()
  return {
    currentUser,
    signIn: async (email, password) => {
      beginSignIn()
      const { data, error } = await client.auth.signInWithPassword({ email, password })
      if (error || !data.user) throw new Error('No se pudo iniciar sesión. Revisa tu correo, contraseña y conexión.')
      const response = await client.from('profiles').select('*').eq('id', data.user.id).single()
      if (response.error || !response.data) throw new Error('No se pudo descargar el perfil de esta cuenta.')
      if (response.data.account_status === 'suspended') { await client.auth.signOut({ scope: 'local' }); throw new Error('Esta cuenta está suspendida.') }
      signedOut = false
      client.auth.startAutoRefresh()
      return mapAccount(response.data)
    },
    signOut: async () => {
      signedOut = true; client.auth.stopAutoRefresh(); requestKeys.clear(); clearStoredAuth()
      // Deliberate device-only logout: do not await remote revocation or an expired-token refresh.
      // The configured storage rejects late writes by an in-flight refresh until a fresh sign-in.
    },
    upload: async op => {
      const response = await client.rpc('mobile_sync_push_v1', {
        p_operation_id: op.id, p_kind: op.kind, p_entity_id: op.entityId, p_payload: op.payload, p_client_updated_at: op.createdAt,
      })
      if (response.error) throw cloudError(response.error)
      const receipt = Array.isArray(response.data) ? response.data[0] : response.data
      if (receipt?.operation_id !== op.id) throw new Error('El servidor no confirmó esta operación. Se conservará para reintentar.')
    },
    download: async accountId => {
      const [planRows, logRows, measurements, mobileResponse] = await Promise.all([
        pages(() => client.from('workout_plans').select('*, workouts(*, workout_exercises(*, exercises(name,name_es,instructions,instructions_es)))').eq('user_id', accountId).order('id')),
        pages(() => client.from('progress_logs').select('*, exercise_logs(*)').eq('user_id', accountId).order('id')),
        pages(() => client.from('measurements').select('*').eq('user_id', accountId).order('id')),
        client.from('mobile_sync_entities').select('kind,payload').eq('user_id', accountId).order('entity_id').range(0, 499),
      ])
      if (mobileResponse.error && !missing(mobileResponse.error)) throw cloudError(mobileResponse.error)
      // Web downloads remain usable before the additive mobile backup migration is installed.
      const mobileRows: Row[] = mobileResponse.error ? [] : await pages(() => client.from('mobile_sync_entities').select('kind,payload').eq('user_id', accountId).order('kind').order('entity_id'))
      const plans = planRows.map(p => mapPlan(p, accountId))
      const sessions = logRows.map(row => mapSession(row, accountId, plans))
      const measurementRows: MobileMeasurement[] = measurements.filter(m => typeof m.weight_kg === 'number').map(m => ({
        id: m.id, accountId, date: m.recorded_at.slice(0, 10), weightKg: m.weight_kg, waistCm: m.waist_cm, notes: m.notes || '', updatedAt: new Date(m.recorded_at).toISOString(), deletedAt: null,
      }))
      let account: MobileAccount | null = null
      for (const row of mobileRows) {
        const payload = row.payload
        if (!payload || (row.kind === 'profile' ? payload.id !== accountId || payload.remoteUserId !== accountId : payload.accountId !== accountId)) continue
        if (row.kind === 'plan') {
          const i = plans.findIndex(p => p.id === payload.id)
          if (i === -1) plans.push(payload as MobilePlan)
        } else if (row.kind === 'session' && !sessions.some(s => s.id === payload.id)) sessions.push(payload as MobileSession)
        else if (row.kind === 'measurement') {
          const i = measurementRows.findIndex(m => m.id === payload.id)
          if (i >= 0) measurementRows[i] = payload as MobileMeasurement
          else measurementRows.push(payload as MobileMeasurement)
        } else if (row.kind === 'profile') account = payload as MobileAccount
      }
      return { plans, sessions, measurements: measurementRows, activePlanId: planRows.find(p => p.is_active)?.id ?? plans[0]?.id ?? null, account }
    },
    listTrainers: async () => {
      const trainers = await pages(() => client.from('active_trainer_directory').select('user_id,slug,professional_name,professional_photo_url,bio,specialties').order('user_id'))
      const result: TrainerCard[] = []
      for (const row of trainers) {
        const response = await client.rpc('get_requestable_trainer_services', { trainer_slug: row.slug })
        if (response.error) throw cloudError(response.error)
        result.push({ id: row.user_id, name: row.professional_name, slug: row.slug, bio: row.bio || '', imageUrl: row.professional_photo_url,
          specialties: row.specialties ?? [], services: (response.data ?? []).map((s: Row) => ({ id: s.service_id, name: s.name, description: s.description, modality: s.modality, durationMinutes: s.duration_minutes })) })
      }
      return result
    },
    requestTrainer: async (serviceId, message) => {
      if (message.length > 1000) throw new Error('El mensaje puede tener hasta 1000 caracteres.')
      const userId = await currentUser()
      const key = `${userId}:${serviceId}:${message.trim()}`
      const idempotencyKey = requestKeys.get(key) ?? crypto.randomUUID()
      requestKeys.set(key, idempotencyKey)
      const response = await client.rpc('create_coaching_request', { service_id: serviceId, message: message.trim(), consent_version: 'training-profile-v1', idempotency_key: idempotencyKey })
      if (response.error) throw cloudError(response.error)
      const receipt = Array.isArray(response.data) ? response.data[0] : response.data
      if (!receipt?.request_id) throw new Error('No se confirmó la solicitud. Reintenta para comprobarla.')
      requestKeys.delete(key)
    },
    listCoaching: async () => {
      const id = await currentUser()
      const [requests, relationships, assignments, plans] = await Promise.all([
        pages(() => client.from('coaching_requests').select('id,service_id,status,message,created_at').eq('client_user_id', id).order('id')),
        pages(() => client.from('coaching_relationships').select('id,trainer_user_id,status,started_at').eq('client_user_id', id).order('id')),
        pages(() => client.from('trainer_plan_assignments').select('id,status,created_at').eq('client_user_id', id).order('id')),
        pages(() => client.from('workout_plans').select('id,name,trainer_assignment_id').eq('user_id', id).eq('source_type', 'trainer_assigned').order('created_at', { ascending: false })),
      ])
      const names = new Map<string, string>()
      for (const trainerId of new Set(relationships.map(r => r.trainer_user_id))) {
        const response = await client.from('public_profiles').select('full_name,username').eq('id', trainerId).maybeSingle()
        names.set(trainerId, response.data?.full_name || response.data?.username || 'Entrenador')
      }
      return {
        requests: requests.map(r => ({ id: r.id, serviceId: r.service_id, status: r.status, message: r.message || '', createdAt: r.created_at })),
        relationships: relationships.map(r => ({ id: r.id, trainerId: r.trainer_user_id, trainerName: names.get(r.trainer_user_id) || 'Entrenador', status: r.status, startedAt: r.started_at })),
        assignments: assignments.map(r => { const plan = plans.find(p => p.trainer_assignment_id === r.id); return { id: r.id, planId: plan?.id ?? null, name: plan?.name || 'Asignación profesional', status: r.status, createdAt: r.created_at } }),
      }
    },
    dispose: () => client.auth.stopAutoRefresh(),
  }
}
