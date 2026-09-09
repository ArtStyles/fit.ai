import { getReadinessReviewStatus, type CardioModality, type MovementLimitation } from '@/lib/training-engine'
import type { Database } from '@/types/database'
import { mutate, read, profile, type Row } from './state'
export interface ReadinessReviewInput {
  activityLevel: Database['public']['Tables']['profiles']['Row']['activity_level']; cardioPreferences: CardioModality[]; warningSymptoms: string[]; knownDisease: boolean; recentSurgery: boolean; medicallyCleared: boolean; limitations: MovementLimitation[]
}
export type ReadinessReviewData = ReadinessReviewInput
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
export function readinessData(row: Row): ReadinessReviewData {
  const answers = row.readiness_answers ?? {}
  return { activityLevel: row.activity_level ?? 'insufficiently_active', cardioPreferences: row.cardio_preferences?.length ? row.cardio_preferences : ['walking'], warningSymptoms: strings(answers.warningSymptoms ?? answers.warning_symptoms), knownDisease: answers.knownCardiovascularMetabolicOrRenalDisease === true || answers.known_disease === true, recentSurgery: answers.recentSurgery === true || answers.recent_surgery === true, medicallyCleared: answers.medicallyCleared === true || answers.medically_cleared === true, limitations: Array.isArray(row.movement_limitations) ? row.movement_limitations.flatMap((item: Row) => !item || typeof item.region !== 'string' || !item.region.trim() ? [] : [{ region: item.region, side: ['left', 'right', 'both'].includes(item.side) ? item.side : null, status: ['acute', 'recovering'].includes(item.status) ? item.status : 'stable', movementsToAvoid: strings(item.movementsToAvoid ?? item.movements_to_avoid), clinicianCleared: item.clinicianCleared === true || item.clinician_cleared === true }]) : [] }
}
export async function loadReadinessReview(): Promise<{ success: boolean; data?: ReadinessReviewData; error?: string }> {
  try { return { success: true, data: readinessData(profile(await read())) } } catch { return { success: false, error: 'No se pudo cargar la preparación.' } }
}
export function applyReadiness(row: Row, input: ReadinessReviewInput) {
  if (!Array.isArray(input.cardioPreferences) || input.cardioPreferences.length === 0) throw new Error('Selecciona al menos una modalidad cardiovascular.')
  if (!Array.isArray(input.limitations) || input.limitations.length > 8) throw new Error('Puedes registrar hasta 8 limitaciones.')
  if (input.limitations.some(item => !item.region.trim() || item.movementsToAvoid.length === 0)) throw new Error('Cada limitación necesita una zona y movimientos que deban evitarse.')
  const status = getReadinessReviewStatus(input)
  Object.assign(row, { activity_level: input.activityLevel, cardio_preferences: [...input.cardioPreferences], readiness_status: status, readiness_answers: { currentlyActive: input.activityLevel === 'regularly_active', warningSymptoms: [...input.warningSymptoms], knownCardiovascularMetabolicOrRenalDisease: input.knownDisease, recentSurgery: input.recentSurgery, medicallyCleared: input.medicallyCleared }, movement_limitations: structuredClone(input.limitations), readiness_version: 'fitai-2026.1', readiness_completed_at: new Date().toISOString() })
  return status
}
export async function saveReadinessReview(input: ReadinessReviewInput): Promise<{ success: boolean; status?: string; error?: string }> {
  try { return await mutate(state => ({ success: true, status: applyReadiness(profile(state), input) })) } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'No se pudo guardar la preparación.' } }
}
