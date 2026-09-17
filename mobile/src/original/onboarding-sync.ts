import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { parseTrainingSettingsForm } from '@/lib/profile/trainingPreferences'
import { applyReadiness, readinessData } from './actions/readiness'
import type { AppRow, AppStore } from './types'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
const failed = () => new Error('No se pudo sincronizar la preparación de tu cuenta. Tus datos siguen guardados; vuelve a intentarlo con conexión.')
const invalid = () => new Error('Revisa tus datos iniciales de entrenamiento antes de conectar esta cuenta.')
const changed = () => new Error('La cuenta activa cambió. Vuelve a conectar la cuenta original para continuar.')
const completions = new WeakMap<AppStore, { owner: string; session: number; pending: Promise<void> }>()

function optionalNumber(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw invalid()
  return value
}

function timestamp(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw invalid()
  return value
}

/** The same fields written by the original onboarding action, validated using
 * its training/readiness contracts. Account privilege and subscription fields
 * are deliberately absent, even when present in a local backup.
 */
function onboardingUpdate(row: AppRow): ProfileUpdate {
  const form = new FormData()
  const entries = {
    primaryGoal: row.primary_goal, fitnessLevel: row.fitness_level,
    daysPerWeek: row.days_per_week, sessionDurationMinutes: row.session_duration_minutes,
    gymType: row.gym_type, injuries: row.injuries ?? '',
  }
  Object.entries(entries).forEach(([key, value]) => { if (value !== null && value !== undefined) form.set(key, String(value)) })
  if (!Array.isArray(row.available_equipment)) throw invalid()
  row.available_equipment.forEach(value => form.append('availableEquipment', String(value)))
  // The original onboarding validates a provisional weekly schedule but does
  // not overwrite the separately editable preferred_workout_days field.
  for (let day = 1; day <= Math.min(Number(row.days_per_week) || 0, 7); day++) form.append('preferredWorkoutDays', String(day))
  const training = parseTrainingSettingsForm(form)
  if (!training.ok) throw invalid()
  if (typeof row.full_name !== 'string' && row.full_name !== null) throw invalid()
  if (row.gender !== null && !['male', 'female', 'other', 'prefer_not_to_say'].includes(row.gender)) throw invalid()
  if (typeof row.date_of_birth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)
    || !Number.isFinite(Date.parse(row.date_of_birth)) || new Date(row.date_of_birth).toISOString().slice(0, 10) !== row.date_of_birth) throw invalid()
  if (!['inactive', 'insufficiently_active', 'regularly_active'].includes(row.activity_level)
    || !Array.isArray(row.cardio_preferences)
    || row.cardio_preferences.some(value => !['walking', 'running', 'cycling', 'elliptical', 'rowing', 'stairs', 'jump_rope'].includes(value))
    || row.readiness_version !== 'fitai-2026.1'
    || !row.readiness_answers || typeof row.readiness_answers !== 'object' || Array.isArray(row.readiness_answers)) throw invalid()
  const assessment = readinessData(row)
  const readiness: AppRow = {}
  applyReadiness(readiness, assessment)
  return {
    full_name: row.full_name?.trim() || null,
    primary_goal: training.value.primaryGoal, fitness_level: training.value.fitnessLevel,
    days_per_week: training.value.daysPerWeek, session_duration_minutes: training.value.sessionDurationMinutes,
    gym_type: training.value.gymType, available_equipment: training.value.availableEquipment,
    injuries: training.value.injuries,
    cardio_preferences: readiness.cardio_preferences, activity_level: readiness.activity_level,
    readiness_status: readiness.readiness_status, readiness_answers: readiness.readiness_answers,
    movement_limitations: readiness.movement_limitations, readiness_version: readiness.readiness_version,
    readiness_completed_at: timestamp(row.readiness_completed_at),
    height_cm: optionalNumber(row.height_cm, 80, 250), weight_kg: optionalNumber(row.weight_kg, 20, 400),
    date_of_birth: row.date_of_birth, gender: row.gender,
    onboarding_done: true, last_check_in_at: timestamp(row.last_check_in_at),
  }
}

/** Runs only through a client already bound to a verified owner's fixed token.
 * Completion is monotonic in the database. Remember successes for this local
 * account session; discard failures so reconnecting retries automatically.
 */
export async function ensureCanonicalOnboarding({ store, client, owner, session, assertCurrent }: {
  store: AppStore; client: SupabaseClient; owner: string; session: number; assertCurrent(): Promise<void>
}): Promise<void> {
  async function currentProfile() {
    await assertCurrent()
    const current = await store.read()
    if (store.sessionVersion() !== session || current?.accountId !== owner || current.remoteUserId !== owner) throw changed()
    return current.tables.profiles?.find(row => row.id === owner)
  }
  const local = await currentProfile()
  if (local?.onboarding_done !== true) return
  let entry = completions.get(store)
  if (!entry || entry.owner !== owner || entry.session !== session) {
    async function complete() {
      const remote = await client.from('profiles').select('id,onboarding_done,weight_kg').eq('id', owner).maybeSingle()
      const latest = await currentProfile()
      if (remote.error || remote.data?.id !== owner) throw failed()
      if (remote.data.onboarding_done === true) return
      if (remote.data.onboarding_done !== false || latest?.onboarding_done !== true) throw failed()
      const payload = onboardingUpdate(latest)
      // Existing canonical measurements own a non-null remote weight. Initial
      // onboarding may set a weight only while the server still has none.
      if (remote.data.weight_kg !== null && remote.data.weight_kg !== undefined) delete payload.weight_kg
      await assertCurrent()
      const updated = await client.from('profiles').update(payload).eq('id', owner).eq('onboarding_done', false).select('id,onboarding_done').maybeSingle()
      await currentProfile()
      if (updated.error) throw failed()
      if (updated.data?.id === owner && updated.data.onboarding_done === true) return
      // Another device may have completed onboarding between the read and the
      // conditional update. Verify its completion without replacing its fields.
      const concurrent = await client.from('profiles').select('id,onboarding_done').eq('id', owner).maybeSingle()
      await currentProfile()
      if (concurrent.error || concurrent.data?.id !== owner || concurrent.data.onboarding_done !== true) throw failed()
    }
    entry = { owner, session, pending: complete() }
    completions.set(store, entry)
  }
  try { await entry.pending; await currentProfile() }
  catch (error) {
    if (completions.get(store) === entry) completions.delete(store)
    throw error
  }
}
