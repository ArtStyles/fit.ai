import { parsePersonalDataForm, type PersonalDataActionState } from '@/lib/profile/personalData'
import { parseTrainingSettingsForm } from '@/lib/profile/trainingPreferences'
import type { TrainingSettingsActionState } from '@/lib/profile/trainingSettingsActionState'
import { createConnectedClient } from '../bridge-client'
import { getAppStore } from '../storage'
import { mutate, profile } from './state'
type ActionResult = { ok: true } | { ok: false; error: string }

async function updatePublicProfile(field: 'is_private' | 'full_name', value: boolean | string | null): Promise<void> {
  const store = await getAppStore()
  const captured = await store.read()
  if (!captured) throw new Error('Selecciona un perfil para continuar.')
  if (captured.remoteUserId) {
    const client = await createConnectedClient(captured.accountId)
    const { data, error } = await client.from('profiles').update({ [field]: value })
      .eq('id', captured.remoteUserId).select(`id,${field}`).single()
    if (error) throw new Error(error.message || 'No se pudo guardar el cambio en tu cuenta conectada.')
    if (!data || data.id !== captured.remoteUserId || (data as Record<string, unknown>)[field] !== value) {
      throw new Error('El servidor no confirmó el cambio. Vuelve a conectar tu cuenta e inténtalo de nuevo.')
    }
  }
  await store.mutate(state => {
    if (state.accountId !== captured.accountId || state.remoteUserId !== captured.remoteUserId) {
      throw new Error('El perfil activo cambió. Vuelve a la cuenta original para comprobar el cambio.')
    }
    profile(state)[field] = value
  })
}

export async function updatePersonalData(_previous: PersonalDataActionState, form: FormData): Promise<PersonalDataActionState> {
  const now = new Date(); const parsed = parsePersonalDataForm(form, now)
  if (!parsed.ok) return { ok: false, message: null, formError: parsed.formError, fieldErrors: parsed.fieldErrors }
  try { await mutate(state => Object.assign(profile(state), { height_cm: parsed.value.heightCm, date_of_birth: parsed.value.dateOfBirth, gender: parsed.value.gender, last_check_in_at: now.toISOString() })); return { ok: true, message: 'Datos personales guardados.', formError: null, fieldErrors: {} } } catch { return { ok: false, message: null, formError: 'No se pudieron guardar los datos personales.', fieldErrors: {} } }
}
export function updateTrainingSettings(form: FormData): Promise<void>
export function updateTrainingSettings(previous: TrainingSettingsActionState, form: FormData): Promise<TrainingSettingsActionState>
export async function updateTrainingSettings(first: TrainingSettingsActionState | FormData, second?: FormData): Promise<TrainingSettingsActionState | void> {
  const respond = (result: TrainingSettingsActionState) => second ? result : undefined
  const parsed = parseTrainingSettingsForm(second ?? first as FormData)
  if (!parsed.ok) return respond({ ok: false, message: null, formError: parsed.formError, fieldErrors: parsed.fieldErrors })
  try {
    await mutate(state => Object.assign(profile(state), { fitness_level: parsed.value.fitnessLevel, primary_goal: parsed.value.primaryGoal, days_per_week: parsed.value.daysPerWeek, session_duration_minutes: parsed.value.sessionDurationMinutes, gym_type: parsed.value.gymType, available_equipment: parsed.value.availableEquipment, injuries: parsed.value.injuries, preferred_workout_days: parsed.value.preferredWorkoutDays, last_check_in_at: new Date().toISOString() }))
    return respond({ ok: true, message: 'Preferencias guardadas.', formError: null, fieldErrors: {} })
  } catch { return respond({ ok: false, message: null, formError: 'No se pudieron guardar las preferencias de entrenamiento.', fieldErrors: {} }) }
}
export type ProfileNameActionState = { ok: boolean; message: string | null; fieldErrors: { fullName?: string } }
export async function updateProfileName(_previous: ProfileNameActionState, form: FormData): Promise<ProfileNameActionState> {
  const name = String(form.get('fullName') ?? '').trim()
  if (name.length > 100) return { ok: false, message: null, fieldErrors: { fullName: 'El nombre no puede superar 100 caracteres.' } }
  try { await updatePublicProfile('full_name', name || null); return { ok: true, message: 'Nombre actualizado.', fieldErrors: {} } } catch (reason) { return { ok: false, message: reason instanceof Error ? reason.message : 'No se pudo guardar el nombre.', fieldErrors: {} } }
}
export async function updateLanguage(language: string): Promise<ActionResult> {
  if (language !== 'es' && language !== 'en') return { ok: false, error: 'Idioma no válido.' }
  try { await mutate(state => { profile(state).language = language }); if (typeof localStorage !== 'undefined') localStorage.setItem('fitai-language', language); return { ok: true } } catch { return { ok: false, error: 'No se pudo guardar el idioma.' } }
}
export async function setPrivacy(isPrivate: boolean): Promise<ActionResult> {
  if (typeof isPrivate !== 'boolean') return { ok: false, error: 'Privacidad no válida.' }
  try { await updatePublicProfile('is_private', isPrivate); return { ok: true } } catch (reason) { return { ok: false, error: reason instanceof Error ? reason.message : 'No se pudo actualizar la privacidad.' } }
}
