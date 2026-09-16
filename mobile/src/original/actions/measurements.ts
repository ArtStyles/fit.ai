import { MEASUREMENT_RANGES, parseMeasurementPayload, type MeasurementFieldErrors } from '@/app/actions/measurements.logic'
import { mutate, read, rows, owner, profile, uuid, type State } from './state'
export interface MeasurementRow { id: string; recorded_at: string; weight_kg: number | null; body_fat_percentage: number | null; muscle_mass_kg: number | null; chest_cm: number | null; waist_cm: number | null; hips_cm: number | null; arms_cm: number | null; legs_cm: number | null; notes: string | null }
export interface LogMeasurementPayload { weight_kg?: number | null; body_fat_percentage?: number | null; muscle_mass_kg?: number | null; chest_cm?: number | null; waist_cm?: number | null; hips_cm?: number | null; arms_cm?: number | null; legs_cm?: number | null; notes?: string | null }
export type MeasurementActionResult = { success: true; id?: string } | { success: false; error: string; fieldErrors?: MeasurementFieldErrors }
export type LogMeasurementResult = MeasurementActionResult
export type MeasurementsLoadResult = { success: true; measurements: MeasurementRow[] } | { success: false; measurements: []; error: string }
export async function getMeasurements(): Promise<MeasurementsLoadResult> {
  try { const state = await read(); return { success: true, measurements: rows(state, 'measurements').filter(row => row.user_id === owner(state)).sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)).slice(0, 100) as MeasurementRow[] } } catch { return { success: false, measurements: [], error: 'No se pudieron cargar las medidas.' } }
}
function syncProfileWeight(state: State) {
  const [minimum, maximum] = MEASUREMENT_RANGES.weight_kg
  const latest = rows(state, 'measurements')
    .filter(row => row.user_id === owner(state) && uuid(row.id) && Number.isFinite(Date.parse(row.recorded_at))
      && typeof row.weight_kg === 'number' && Number.isFinite(row.weight_kg) && row.weight_kg >= minimum && row.weight_kg <= maximum)
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at) || b.id.toLowerCase().localeCompare(a.id.toLowerCase()))[0]
  profile(state).weight_kg = latest?.weight_kg ?? null
}
export function changeMeasurement(state: State, mode: 'create' | 'update' | 'delete', id: string | null, payload?: LogMeasurementPayload): MeasurementActionResult {
  if (mode !== 'create' && !uuid(id)) return { success: false, error: 'Identificador de medida inválido.' }
  const entry = rows(state, 'measurements').find(row => row.id === id && row.user_id === owner(state))
  if (mode !== 'create' && !entry) return { success: false, error: 'Medida no encontrada.' }
  if (mode === 'delete') {
    state.tables.measurements = rows(state, 'measurements').filter(row => row !== entry)
    if (entry!.weight_kg != null) syncProfileWeight(state)
    return { success: true }
  }
  const parsed = parseMeasurementPayload(payload ?? {})
  if (!parsed.ok) return { success: false, error: parsed.error, fieldErrors: parsed.fieldErrors }
  if (mode === 'update') {
    const previousWeight = entry!.weight_kg ?? null
    Object.assign(entry!, parsed.value)
    if ((entry!.weight_kg ?? null) !== previousWeight) syncProfileWeight(state)
    return { success: true, id: id! }
  }
  const nextId = crypto.randomUUID()
  rows(state, 'measurements').push({ id: nextId, user_id: owner(state), recorded_at: new Date().toISOString(), ...parsed.value })
  if (parsed.value.weight_kg != null) syncProfileWeight(state)
  return { success: true, id: nextId }
}
async function change(mode: 'create' | 'update' | 'delete', id: string | null, payload?: LogMeasurementPayload) {
  try { return await mutate(state => changeMeasurement(state, mode, id, payload)) } catch { return { success: false as const, error: 'No se pudo guardar el cambio en este dispositivo.' } }
}
export const logMeasurement = (payload: LogMeasurementPayload): Promise<LogMeasurementResult> => change('create', null, payload)
export const updateMeasurement = (id: string, payload: LogMeasurementPayload): Promise<LogMeasurementResult> => change('update', id, payload)
export const deleteMeasurement = (id: string): Promise<MeasurementActionResult> => change('delete', id)
