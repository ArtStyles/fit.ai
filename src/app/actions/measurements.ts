'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  parseMeasurementPayload,
  type MeasurementFieldErrors,
} from './measurements.logic'

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

export type MeasurementActionResult =
  | { success: true; id?: string }
  | { success: false; error: string; fieldErrors?: MeasurementFieldErrors }

export type LogMeasurementResult = MeasurementActionResult

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const AUTHENTICATION_ERROR = 'No autenticado'
const INVALID_ID_ERROR = 'Identificador de medida inválido.'
const CREATE_ERROR = 'No se pudo guardar la medida.'
const UPDATE_ERROR = 'No se pudo actualizar la medida.'
const DELETE_ERROR = 'No se pudo eliminar la medida.'
const MEASUREMENT_PATHS = ['/medidas', '/settings/datos', '/dashboard', '/progress'] as const

function revalidateMeasurementPaths() {
  for (const path of MEASUREMENT_PATHS) revalidatePath(path)
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
  if (!user) return { success: false, error: AUTHENTICATION_ERROR }

  const parsed = parseMeasurementPayload(payload)
  if (!parsed.ok) {
    return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors }
  }

  const { data, error } = await (supabase
    .from('measurements') as any)
    .insert({
      user_id: user.id,
      ...parsed.value,
      recorded_at: new Date().toISOString(),
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) {
    return { success: false, error: CREATE_ERROR }
  }

  revalidateMeasurementPaths()
  return { success: true, id: data.id }
}

export async function deleteMeasurement(id: string): Promise<MeasurementActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: AUTHENTICATION_ERROR }
  if (!UUID.test(id)) return { success: false, error: INVALID_ID_ERROR }

  const { data, error } = await (supabase
    .from('measurements') as any)
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) return { success: false, error: DELETE_ERROR }

  revalidateMeasurementPaths()
  return { success: true }
}

export async function updateMeasurement(
  id: string,
  payload: LogMeasurementPayload,
): Promise<LogMeasurementResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: AUTHENTICATION_ERROR }
  if (!UUID.test(id)) return { success: false, error: INVALID_ID_ERROR }

  const parsed = parseMeasurementPayload(payload)
  if (!parsed.ok) {
    return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors }
  }

  const { data, error } = await (supabase
    .from('measurements') as any)
    .update(parsed.value)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle() as { data: { id: string } | null; error: { message: string } | null }

  if (error || !data) return { success: false, error: UPDATE_ERROR }

  revalidateMeasurementPaths()
  return { success: true, id: data.id }
}
