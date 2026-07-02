'use server'

import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/types/database'
import type { CardioModality, MovementLimitation } from '@/lib/training-engine'

type ActivityLevel = Database['public']['Tables']['profiles']['Row']['activity_level']

export interface ReadinessReviewInput {
  activityLevel: ActivityLevel
  cardioPreferences: CardioModality[]
  warningSymptoms: string[]
  knownDisease: boolean
  recentSurgery: boolean
  medicallyCleared: boolean
  limitation: MovementLimitation | null
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

  const limitation = input.limitation
  const requiresClearance =
    (input.warningSymptoms.length > 0 && !input.medicallyCleared) ||
    (input.recentSurgery && !input.medicallyCleared) ||
    (input.knownDisease && !input.medicallyCleared) ||
    (limitation !== null && (!limitation.clinicianCleared || (
      limitation.status === 'acute' ||
      (limitation.status === 'recovering' && !limitation.clinicianCleared)
    )))

  const status = requiresClearance
    ? 'professional_clearance_required'
    : limitation
      ? 'modified'
      : 'cleared'

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
      movement_limitations: (limitation ? [limitation] : []) as unknown as Json,
      readiness_version: 'fitai-2026.1',
      readiness_completed_at: new Date().toISOString(),
    } as never)
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  return { success: true, status }
}
