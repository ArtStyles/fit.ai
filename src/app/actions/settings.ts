'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function nullableText(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  const text = typeof value === 'string' ? value.trim() : ''
  return text.length > 0 ? text : null
}

function nullableNumber(formData: FormData, key: string): number | null {
  const value = formData.get(key)
  const parsed = Number.parseFloat(typeof value === 'string' ? value : '')
  return Number.isFinite(parsed) ? parsed : null
}

function nullableInteger(formData: FormData, key: string): number | null {
  const value = formData.get(key)
  const parsed = Number.parseInt(typeof value === 'string' ? value : '', 10)
  return Number.isFinite(parsed) ? parsed : null
}

function csvList(formData: FormData, key: string): string[] {
  const value = nullableText(formData, key)
  if (!value) return []
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

// Datos personales (/settings/datos): solo escribe sus columnas para no
// pisar el resto del perfil al guardar desde una página separada.
export async function updatePersonalData(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')

  const { error } = await (supabase
    .from('profiles') as any)
    .update({
      height_cm: nullableNumber(formData, 'heightCm'),
      weight_kg: nullableNumber(formData, 'weightKg'),
      date_of_birth: nullableText(formData, 'dateOfBirth'),
      gender: nullableText(formData, 'gender'),
      last_check_in_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) redirect('/settings/datos?error=save_failed')

  revalidatePath('/settings/datos')
  revalidatePath('/dashboard')
  redirect('/settings/datos?notice=settings_saved')
}

// Entrenamiento (/settings/entrenamiento): objetivos, disponibilidad y equipo.
export async function updateTrainingSettings(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=auth_required')

  const preferredWorkoutDays = formData
    .getAll('preferredWorkoutDays')
    .map(value => Number.parseInt(String(value), 10))
    .filter(value => Number.isFinite(value) && value >= 1 && value <= 7)

  const { error } = await (supabase
    .from('profiles') as any)
    .update({
      fitness_level: nullableText(formData, 'fitnessLevel'),
      primary_goal: nullableText(formData, 'primaryGoal'),
      days_per_week: nullableInteger(formData, 'daysPerWeek'),
      session_duration_minutes: nullableInteger(formData, 'sessionDurationMinutes'),
      gym_type: nullableText(formData, 'gymType'),
      available_equipment: csvList(formData, 'availableEquipment'),
      injuries: nullableText(formData, 'injuries'),
      preferred_workout_days: preferredWorkoutDays.length > 0 ? preferredWorkoutDays : null,
      last_check_in_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) redirect('/settings/entrenamiento?error=save_failed')

  revalidatePath('/settings/entrenamiento')
  revalidatePath('/dashboard')
  revalidatePath('/plan')
  redirect('/settings/entrenamiento?notice=settings_saved')
}
