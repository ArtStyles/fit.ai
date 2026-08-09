'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TrainerProgramSnapshotV1 } from '@/lib/coaching/programs'
import { acceptTrainerAssignment } from '@/app/actions/trainerAssignments'

export type ProposedProgramReviewView = {
  assignmentId: string
  versionNumber: number
  trainerName: string
  snapshot: TrainerProgramSnapshotV1
  exerciseNames: Record<string, string>
}

/** An intentionally read-only proposal; only the atomic acceptance may change it. */
export function ProposedProgramReview({ proposal }: { proposal: ProposedProgramReviewView }) {
  const { snapshot } = proposal
  const router = useRouter()
  const [isAccepting, setIsAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const acceptanceKeyRef = useRef<string | null>(null)

  async function accept() {
    if (!window.confirm('Al aceptar, esta rutina será tu plan principal y quedará bloqueada para edición. ¿Continuar?')) return
    setIsAccepting(true)
    setError(null)
    const data = new FormData()
    data.set('assignmentId', proposal.assignmentId)
    const idempotencyKey = acceptanceKeyRef.current ?? crypto.randomUUID()
    acceptanceKeyRef.current = idempotencyKey
    data.set('idempotencyKey', idempotencyKey)
    try {
      const result = await acceptTrainerAssignment(data)
      if (!result.ok) {
        setError(result.error)
        return
      }
      acceptanceKeyRef.current = null
      setAccepted(true)
      router.refresh()
    } catch {
      setError('No se pudo activar la rutina. Inténtalo de nuevo.')
    } finally {
      setIsAccepting(false)
    }
  }

  return <section className="mt-6 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4" aria-labelledby={`proposed-program-${proposal.assignmentId}`}>
    <p className="text-sm font-semibold text-violet-300">Rutina profesional propuesta</p>
    <h2 id={`proposed-program-${proposal.assignmentId}`} className="mt-1 text-xl font-bold text-foreground">{snapshot.name}</h2>
    <p className="mt-1 text-sm text-muted-foreground">Enviada por {proposal.trainerName} · versión {proposal.versionNumber}</p>
    {snapshot.goal ? <p className="mt-3 text-sm text-foreground"><span className="font-semibold">Objetivo:</span> {snapshot.goal}</p> : null}
    {snapshot.description ? <p className="mt-2 text-sm text-muted-foreground">{snapshot.description}</p> : null}
    <p className="mt-3 text-sm text-muted-foreground">{snapshot.daysPerWeek} días por semana. Esta prescripción se mantiene bloqueada: podrás ejecutarla, pero no editar ejercicios ni sus indicaciones.</p>
    <ol className="mt-4 space-y-3">{snapshot.workouts.map(workout => <li key={workout.sourceTemplateWorkoutId} className="rounded-xl border border-border/70 bg-background/40 p-3"><h3 className="font-semibold text-foreground">Día {workout.dayOfWeek}: {workout.name}</h3><ul className="mt-2 space-y-2">{workout.exercises.map(exercise => <li key={exercise.sourceTemplateExerciseId} className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{proposal.exerciseNames[exercise.exerciseId] ?? 'Ejercicio prescrito'}</span> · {exercise.sets} series × {exercise.reps} repeticiones{exercise.weightKg !== null ? ` · ${exercise.weightKg} kg` : ''}{exercise.targetRpe !== null ? ` · RPE ${exercise.targetRpe}` : ''}{exercise.restSeconds ? ` · descanso ${exercise.restSeconds}s` : ''}{exercise.notes ? ` · ${exercise.notes}` : ''}</li>)}</ul></li>)}</ol>
    <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
      <p>Al aceptar, esta será tu rutina principal. Podrás ejecutarla y registrar resultados, pero no modificar sus ejercicios ni indicaciones.</p>
      {error ? <p role="alert" className="mt-2 text-red-300">{error}</p> : null}
      {accepted ? <p role="status" className="mt-2 text-emerald-300">Rutina activada. Actualizando tu plan…</p> : null}
      <button type="button" onClick={accept} disabled={isAccepting || accepted} className="mt-3 rounded-lg bg-violet-500 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
        {isAccepting ? 'Activando…' : accepted ? 'Rutina activada' : 'Aceptar rutina'}
      </button>
    </div>
  </section>
}
