'use server'

import { createClient } from '@/lib/supabase/server'

export interface ProgressionPoint {
  date: string          // ISO timestamp
  maxWeightKg: number
  repsAtMax: number
  totalVolume: number   // kg·reps
}

export interface TrackedExercise {
  id: string
  name: string
  muscleGroups: string[]
  sessionCount: number
}

export async function getExerciseProgressionData(
  exerciseId: string,
): Promise<ProgressionPoint[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // 1. Get user session log IDs (all time, sorted ascending for chart)
  const { data: userLogs } = await (supabase
    .from('progress_logs') as any)
    .select('id, completed_at')
    .eq('user_id', user.id)
    .order('completed_at', { ascending: true })
    .limit(300) as { data: { id: string; completed_at: string }[] | null }

  const logIds = (userLogs ?? []).map(l => l.id)
  if (logIds.length === 0) return []

  // 2. Get exercise logs for this exercise in those sessions
  const { data: exerciseLogs } = await (supabase
    .from('exercise_logs') as any)
    .select('progress_log_id, weights_kg, reps_completed')
    .in('progress_log_id', logIds)
    .eq('exercise_id', exerciseId) as {
      data: {
        progress_log_id: string
        weights_kg: number[] | null
        reps_completed: number[] | null
      }[] | null
    }

  const logDateMap = new Map((userLogs ?? []).map(l => [l.id, l.completed_at]))

  return (exerciseLogs ?? [])
    .map(log => {
      const weights = (log.weights_kg ?? []).map(Number)
      const reps   = (log.reps_completed ?? []).map(Number)
      const maxWeightKg  = weights.reduce((max, w) => Math.max(max, w), 0)
      const maxIdx       = weights.findIndex(w => w === maxWeightKg)
      const repsAtMax    = reps[maxIdx] ?? 0
      const totalVolume  = Math.round(weights.reduce((sum, w, i) => sum + w * (reps[i] ?? 0), 0))
      const date         = logDateMap.get(log.progress_log_id)
      return { date: date!, maxWeightKg, repsAtMax, totalVolume }
    })
    .filter(p => p.date && p.maxWeightKg > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
