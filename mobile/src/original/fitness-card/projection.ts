import { projectFitnessCard } from '@/lib/fitness-card/projection'
import type { FitnessEvidence } from '@/lib/fitness-card/types'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'
import type { AppState } from '../types'

export function projectLocalFitnessCard(state: AppState, now = new Date()): FitnessEvidence {
  const profile = (state.tables.profiles ?? []).find(row => row.id === state.accountId)
  return projectFitnessCard({
    ownerId: state.accountId,
    logs: state.tables.progress_logs ?? [],
    exerciseLogs: state.tables.exercise_logs ?? [],
    exercises: state.tables.exercises ?? [],
    timeZone: resolveUserTimeZone(profile?.timezone),
    language: profile?.language === 'en' ? 'en' : 'es',
    now,
  })
}
