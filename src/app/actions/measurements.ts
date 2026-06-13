'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { payloadHasValue } from './measurements.logic'

export interface MeasurementRow {
  id: string
  recorded_at: string
  weight_kg: number | null
  body_fat_percentage: number | null
  muscle_mass_kg: number | null
  chest_cm: number | null
  waist_cm: number | null
  hips_cm: number | null
  arms_cm: number | null
  legs_cm: number | null
  notes: string | null
}

export interface LogMeasurementPayload {
  weight_kg?: number | null
  body_fat_percentage?: number | null
  muscle_mass_kg?: number | null
  chest_cm?: number | null
  waist_cm?: number | null
  hips_cm?: number | null
  arms_cm?: number | null
  legs_cm?: number | null
  notes?: string | null
}

export interface LogMeasurementResult {
  success: boolean
  id?: string
  error?: string
}

export async function getMeasurements(): Promise<MeasurementRow[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await (supabase
    .from('measurements') as any)
    .select('id, recorded_at, weight_kg, body_fat_percentage, muscle_mass_kg, chest_cm, waist_cm, hips_cm, arms_cm, legs_cm, notes')
    .eq('user_id', user.id)
    .order('recorded_at', { ascending: false })
    .limit(100) as { data: MeasurementRow[] | null }

  return data ?? []
}

export async function logMeasurement(
  payload: LogMeasurementPayload,
): Promise<LogMeasurementResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  if (!payloadHasValue(payload)) return { success: false, error: 'Introduce al menos un valor' }

  const { data, error } = await (supabase
    .from('measurements') as any)
    .insert({
      user_id: user.id,
      ...payload,
      recorded_at: new Date().toISOString(),
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) {
    return { success: false, error: error?.message ?? 'No se pudo guardar' }
  }

  revalidatePath('/medidas')
  return { success: true, id: data.id }
}

export async function deleteMeasurement(id: string): Promise<{ success: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  await (supabase
    .from('measurements') as any)
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  revalidatePath('/medidas')
  return { success: true }
}

export async function updateMeasurement(
  id: string,
  payload: LogMeasurementPayload,
): Promise<LogMeasurementResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  if (!payloadHasValue(payload)) return { success: false, error: 'Introduce al menos un valor' }

  const { error } = await (supabase
    .from('measurements') as any)
    .update(payload)
    .eq('id', id)
    .eq('user_id', user.id) as { error: { message: string } | null }

  if (error) return { success: false, error: error.message }

  revalidatePath('/medidas')
  return { success: true, id }
}
