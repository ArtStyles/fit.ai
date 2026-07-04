'use server'

import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/types/database'
import { getReadinessReviewStatus } from '@/lib/training-engine'
import type { CardioModality, MovementLimitation } from '@/lib/training-engine'

type ActivityLevel = Database['public']['Tables']['profiles']['Row']['activity_level']

export interface ReadinessReviewInput {
  activityLevel: ActivityLevel
  cardioPreferences: CardioModality[]
  warningSymptoms: string[]
  knownDisease: boolean
  recentSurgery: boolean
  medicallyCleared: boolean
  limitations: MovementLimitation[]
}

export type ReadinessReviewData = ReadinessReviewInput

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function parseLimitations(value: Json): MovementLimitation[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as Record<string, Json | undefined>
    if (typeof row.region !== 'string' || !row.region.trim()) return []
    return [{
      region: row.region,
      side: row.side === 'left' || row.side === 'right' || row.side === 'both' ? row.side : null,
      status: row.status === 'acute' || row.status === 'recovering' ? row.status : 'stable',
      movementsToAvoid: stringArray(row.movementsToAvoid ?? row.movements_to_avoid),
      clinicianCleared: row.clinicianCleared === true || row.clinician_cleared === true,
    } satisfies MovementLimitation]
  })
}

export async function loadReadinessReview(): Promise<{
  success: boolean
  data?: ReadinessReviewData
  error?: string
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('activity_level, cardio_preferences, readiness_answers, movement_limitations')
    .eq('id', user.id)
    .single() as unknown as {
      data: {
        activity_level: ActivityLevel
        cardio_preferences: CardioModality[]
        readiness_answers: Json
        movement_limitations: Json
      } | null
      error: { message: string } | null
    }

  if (error || !profile) return { success: false, error: error?.message ?? 'Perfil no encontrado' }

  const answers = profile.readiness_answers && typeof profile.readiness_answers === 'object' && !Array.isArray(profile.readiness_answers)
    ? profile.readiness_answers as Record<string, Json | undefined>
    : {}

  return {
    success: true,
    data: {
      activityLevel: profile.activity_level,
      cardioPreferences: profile.cardio_preferences.length > 0 ? profile.cardio_preferences : ['walking'],
      warningSymptoms: stringArray(answers.warningSymptoms ?? answers.warning_symptoms),
      knownDisease: answers.knownCardiovascularMetabolicOrRenalDisease === true || answers.known_disease === true,
      recentSurgery: answers.recentSurgery === true || answers.recent_surgery === true,
      medicallyCleared: answers.medicallyCleared === true || answers.medically_cleared === true,
      limitations: parseLimitations(profile.movement_limitations),
    },
  }
}

export async function saveReadinessReview(
  input: ReadinessReviewInput,
): Promise<{ success: boolean; status?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  if (input.cardioPreferences.length === 0) {
    return { success: false, error: 'Selecciona al menos una modalidad cardiovascular.' }
  }
  if (input.limitations.length > 8) {
    return { success: false, error: 'Puedes registrar hasta 8 limitaciones.' }
  }
  if (input.limitations.some(item => !item.region.trim() || item.movementsToAvoid.length === 0)) {
    return { success: false, error: 'Cada limitación necesita una zona y movimientos que deban evitarse.' }
  }

  const status = getReadinessReviewStatus(input)

  const { error } = await supabase
    .from('profiles')
    .update({
      activity_level: input.activityLevel,
      cardio_preferences: input.cardioPreferences,
      readiness_status: status,
      readiness_answers: {
        currentlyActive: input.activityLevel === 'regularly_active',
        warningSymptoms: input.warningSymptoms,
        knownCardiovascularMetabolicOrRenalDisease: input.knownDisease,
        recentSurgery: input.recentSurgery,
        medicallyCleared: input.medicallyCleared,
      } as Json,
      movement_limitations: input.limitations as unknown as Json,
      readiness_version: 'fitai-2026.1',
      readiness_completed_at: new Date().toISOString(),
    } as never)
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  return { success: true, status }
}
