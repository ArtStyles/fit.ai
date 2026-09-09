import { Capacitor, registerPlugin } from '@capacitor/core'
import { normalizeSessionSnapshot } from '@/lib/session/persistSession'
import type { MobileAccount, MobilePlan, MobileRepository, MobileSession } from '../domain/types'

interface LegacyRecoveryPlugin {
  readSessions(options: { userId: string }): Promise<{ snapshots: unknown[] }>
}
const LegacyRecovery = registerPlugin<LegacyRecoveryPlugin>('LegacyRecovery')

export function convertLegacySnapshot(value: unknown, account: MobileAccount, plans: MobilePlan[]): MobileSession | null {
  if (!account.remoteUserId || !value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 2 || typeof candidate.workoutId !== 'string') return null
  const plan = plans.find(item => item.accountId === account.id && item.workouts.some(workout => workout.id === candidate.workoutId))
  if (!plan) return null
  const snapshot = normalizeSessionSnapshot(value, candidate.workoutId, account.remoteUserId)
  if (!snapshot || !snapshot.exercises.length) return null
  const sessionId = snapshot.clientSessionId || `legacy-${snapshot.workoutId}-${snapshot.startedAt}`
  return {
    id: sessionId, accountId: account.id, planId: plan.id, workoutId: snapshot.workoutId,
    workoutName: snapshot.workoutName, source: plan.source,
    startedAt: new Date(snapshot.startedAt).toISOString(),
    finishedAt: snapshot.finishedAt ? new Date(snapshot.finishedAt).toISOString() : null,
    remoteId: null, rpe: null, notes: 'Recuperada de la versión anterior de Vekira.',
    exercises: snapshot.exercises.map(exercise => ({
      prescription: {
        id: exercise.workoutExerciseId, exerciseId: exercise.exerciseId, name: exercise.name,
        imageUrl: exercise.imageUrl, instructions: exercise.instructions ?? '', sets: exercise.targetSets,
        reps: exercise.targetReps, durationSeconds: exercise.targetDuration, restSeconds: exercise.restSeconds,
        weightKg: exercise.suggestedWeight, targetRpe: exercise.targetRpe,
      },
      sets: exercise.sets.map((set, index) => ({
        id: `${sessionId}-${exercise.workoutExerciseId}-${index}`,
        reps: set.reps === '' ? null : Number(set.reps),
        weightKg: set.weightKg === '' ? null : Number(set.weightKg),
        durationSeconds: set.durationSeconds ?? null, completed: set.completed,
      })),
    })),
  }
}

/** Read-only legacy origin extraction. Original records are deliberately retained. */
export async function recoverLegacyDrafts(repository: MobileRepository, account: MobileAccount): Promise<{ recovered: number; skipped: number }> {
  if (!Capacitor.isNativePlatform()) throw new Error('La recuperación de la versión anterior está disponible en Android.')
  if (!account.remoteUserId) throw new Error('Conecta la cuenta original y descarga sus rutinas antes de recuperar la sesión.')
  const data = await repository.loadData(account.id)
  const { snapshots } = await LegacyRecovery.readSessions({ userId: account.remoteUserId })
  const existing = new Set(data.sessions.map(session => session.id))
  let recovered = 0
  let skipped = 0
  for (const raw of snapshots) {
    const session = convertLegacySnapshot(raw, account, data.plans)
    if (!session || existing.has(session.id)) { skipped++; continue }
    await repository.saveSession(session, session.finishedAt !== null)
    existing.add(session.id)
    recovered++
  }
  return { recovered, skipped }
}
