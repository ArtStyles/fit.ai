'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { parsePersonalDataForm, type PersonalDataActionState } from '@/lib/profile/personalData'
import { parseTrainingSettingsForm } from '@/lib/profile/trainingPreferences'
import type { TrainingSettingsActionState } from '@/lib/profile/trainingSettingsActionState'
import type { ActionResult } from './posts'

// Datos personales (/settings/datos): solo escribe sus columnas para no
// pisar el resto del perfil al guardar desde una página separada.
export async function updatePersonalData(
  _previousState: PersonalDataActionState,
  formData: FormData,
): Promise<PersonalDataActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, message: null, formError: 'Sesión no válida.', fieldErrors: {} }
  }

  const now = new Date()
  const parsed = parsePersonalDataForm(formData, now)
  if (!parsed.ok) {
    return {
      ok: false,
      message: null,
      formError: parsed.formError,
      fieldErrors: parsed.fieldErrors,
    }
  }

  const { data, error } = await (supabase
    .from('profiles') as any)
    .update({
      height_cm: parsed.value.heightCm,
      date_of_birth: parsed.value.dateOfBirth,
      gender: parsed.value.gender,
      last_check_in_at: now.toISOString(),
    })
    .eq('id', user.id)
    .select('id')
    .single()

  if (error || !data) {
    return {
      ok: false,
      message: null,
      formError: 'No se pudieron guardar los datos personales.',
      fieldErrors: {},
    }
  }

  revalidatePath('/settings/datos')
  revalidatePath('/dashboard')
  revalidatePath('/progress')
  return { ok: true, message: 'Datos personales guardados.', formError: null, fieldErrors: {} }
}

// Entrenamiento (/settings/entrenamiento): objetivos, disponibilidad y equipo.
export function updateTrainingSettings(formData: FormData): Promise<void>
export function updateTrainingSettings(
  previousState: TrainingSettingsActionState,
  formData: FormData,
): Promise<TrainingSettingsActionState>
export async function updateTrainingSettings(
  previousStateOrFormData: TrainingSettingsActionState | FormData,
  statefulFormData?: FormData,
): Promise<TrainingSettingsActionState | void> {
  const isDirectFormAction = statefulFormData === undefined
  const formData = isDirectFormAction
    ? previousStateOrFormData as FormData
    : statefulFormData
  const respond = (state: TrainingSettingsActionState) => isDirectFormAction ? undefined : state

  const parsed = parseTrainingSettingsForm(formData)
  if (!parsed.ok) {
    return respond({
      ok: false,
      message: null,
      formError: parsed.formError,
      fieldErrors: parsed.fieldErrors,
    })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return respond({ ok: false, message: null, formError: 'Sesión no válida.', fieldErrors: {} })
  }

  const { error } = await (supabase
    .from('profiles') as any)
    .update({
      fitness_level: parsed.value.fitnessLevel,
      primary_goal: parsed.value.primaryGoal,
      days_per_week: parsed.value.daysPerWeek,
      session_duration_minutes: parsed.value.sessionDurationMinutes,
      gym_type: parsed.value.gymType,
      available_equipment: parsed.value.availableEquipment,
      injuries: parsed.value.injuries,
      preferred_workout_days: parsed.value.preferredWorkoutDays,
      last_check_in_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return respond({
      ok: false,
      message: null,
      formError: 'No se pudieron guardar las preferencias de entrenamiento.',
      fieldErrors: {},
    })
  }

  revalidatePath('/settings/entrenamiento')
  revalidatePath('/dashboard')
  revalidatePath('/plan')
  return respond({ ok: true, message: 'Preferencias guardadas.', formError: null, fieldErrors: {} })
}

export type ProfileNameActionState = {
  ok: boolean
  message: string | null
  fieldErrors: { fullName?: string }
}

// Perfil (/settings/perfil): solo el nombre (la foto va por su propia acción).
export async function updateProfileName(
  _previous: ProfileNameActionState,
  formData: FormData,
): Promise<ProfileNameActionState> {
  const fullName = String(formData.get('fullName') ?? '').trim()
  if (fullName.length > 100) {
    return {
      ok: false,
      message: null,
      fieldErrors: { fullName: 'El nombre no puede superar 100 caracteres.' },
    }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Sesión no válida.', fieldErrors: {} }

  const { error } = await (supabase
    .from('profiles') as any)
    .update({ full_name: fullName || null })
    .eq('id', user.id)

  if (error) return { ok: false, message: 'No se pudo guardar el nombre.', fieldErrors: {} }

  revalidatePath('/settings/perfil')
  revalidatePath('/dashboard')
  return { ok: true, message: 'Nombre actualizado.', fieldErrors: {} }
}

export async function updateLanguage(language: string): Promise<ActionResult> {
  if (language !== 'es' && language !== 'en') return { ok: false, error: 'Idioma no válido.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase
    .from('profiles') as any)
    .update({ language })
    .eq('id', user.id)

  if (error) return { ok: false, error: 'No se pudo guardar el idioma.' }

  cookies().set('fitai-language', language, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 31_536_000,
  })
  revalidatePath('/', 'layout')
  return { ok: true }
}

export async function setPrivacy(isPrivate: boolean): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }
  const { error } = await (supabase.from('profiles') as any)
    .update({ is_private: isPrivate }).eq('id', user.id)
  if (error) return { ok: false, error: 'No se pudo actualizar la privacidad.' }
  revalidatePath('/settings/perfil')
  return { ok: true }
}
