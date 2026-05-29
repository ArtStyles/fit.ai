'use server'

import { createClient } from '@/lib/supabase/server'
import { mockAdjustmentSuggestion, type AdjustmentContext } from '@/lib/ai/mock-adjustmentGenerator'

export interface SuggestAdjustmentResult {
  success: boolean
  suggestion?: string
  isMock?: boolean
  error?: string
}

export async function suggestWorkoutAdjustment(
  workoutId: string,
  request: string,
  context: AdjustmentContext,
): Promise<SuggestAdjustmentResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  const trimmed = request.trim()
  if (!trimmed) return { success: false, error: 'Describe qué quieres cambiar' }

  // Verify workout belongs to user's active plan
  const { data: workout } = await (supabase
    .from('workouts') as any)
    .select('id, plan_id')
    .eq('id', workoutId)
    .maybeSingle() as { data: { id: string; plan_id: string } | null }

  if (!workout) return { success: false, error: 'Entrenamiento no encontrado' }

  const { data: plan } = await (supabase
    .from('workout_plans') as any)
    .select('id')
    .eq('id', workout.plan_id)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle() as { data: { id: string } | null }

  if (!plan) return { success: false, error: 'Sin permisos para este plan' }

  const response = await mockAdjustmentSuggestion(trimmed, context)

  return { success: true, suggestion: response.suggestion, isMock: response.isMock }
}
