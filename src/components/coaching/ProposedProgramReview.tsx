'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TrainerProgramSnapshotV1 } from '@/lib/coaching/programs'
import { acceptTrainerAssignment, declineTrainerAssignment } from '@/app/actions/trainerAssignments'

export type ProposedProgramReviewView = {
  assignmentId: string
  versionNumber: number
  changeSummary: string | null
  trainerName: string
  canAccept: boolean
  exerciseDetailsAvailable: boolean
  snapshot: TrainerProgramSnapshotV1
  exerciseNames: Record<string, string>
}

/** An intentionally read-only proposal; only the atomic acceptance may change it. */
export function ProposedProgramReview({ proposal }: { proposal: ProposedProgramReviewView }) {
  const { snapshot } = proposal
  const canAccept = proposal.canAccept && proposal.exerciseDetailsAvailable
  const router = useRouter()
  const [isAccepting, setIsAccepting] = useState(false)
  const [isDeclining, setIsDeclining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [declined, setDeclined] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const acceptanceKeyRef = useRef<string | null>(null)
  const declineKeyRef = useRef<string | null>(null)
  const mutationLockRef = useRef(false)
  const isMutating = isAccepting || isDeclining
  const isTerminal = accepted || declined

  async function accept() {
    if (!canAccept || mutationLockRef.current || isTerminal) return
    if (!window.confirm('Al aceptar, esta rutina será tu plan principal y quedará bloqueada para edición. ¿Continuar?')) return
    mutationLockRef.current = true
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
      mutationLockRef.current = false
      setIsAccepting(false)
    }
  }

  async function decline() {
    if (mutationLockRef.current || isTerminal) return
    if (!window.confirm('Esta propuesta quedará cerrada y no se activará como tu rutina. ¿No aceptar la rutina?')) return
    mutationLockRef.current = true
    setIsDeclining(true)
    setError(null)
    const data = new FormData()
    data.set('assignmentId', proposal.assignmentId)
    data.set('reason', declineReason)
    const idempotencyKey = declineKeyRef.current ?? crypto.randomUUID()
    declineKeyRef.current = idempotencyKey
    data.set('idempotencyKey', idempotencyKey)
    try {
      const result = await declineTrainerAssignment(data)
      if (!result.ok) {
        setError(result.error)
        return
      }
      declineKeyRef.current = null
      setDeclined(true)
      router.refresh()
    } catch {
      setError('No se pudo rechazar la rutina. Inténtalo de nuevo.')
    } finally {
      mutationLockRef.current = false
      setIsDeclining(false)
    }
  }

  return <section className="mt-6 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4" aria-labelledby={`proposed-program-${proposal.assignmentId}`}>
    <p className="text-sm font-semibold text-violet-300">Rutina profesional propuesta</p>
    <h2 id={`proposed-program-${proposal.assignmentId}`} className="mt-1 text-xl font-bold text-foreground">{snapshot.name}</h2>
    <p className="mt-1 text-sm text-muted-foreground">Enviada por {proposal.trainerName} · versión {proposal.versionNumber}</p>
    {snapshot.goal ? <p className="mt-3 text-sm text-foreground"><span className="font-semibold">Objetivo:</span> {snapshot.goal}</p> : null}
    {snapshot.description ? <p className="mt-2 text-sm text-muted-foreground">{snapshot.description}</p> : null}
    {proposal.changeSummary ? <p className="mt-3 rounded-xl border border-violet-400/25 bg-violet-500/10 p-3 text-sm leading-relaxed text-violet-100"><span className="font-semibold">Mensaje del entrenador:</span> {proposal.changeSummary}</p> : null}
    <p className="mt-3 text-sm text-muted-foreground">{snapshot.daysPerWeek} días por semana. Esta prescripción se mantiene bloqueada: podrás ejecutarla, pero no editar ejercicios ni sus indicaciones.</p>
    {!proposal.exerciseDetailsAvailable ? <p role="alert" className="mt-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-foreground">No se pudieron cargar todos los detalles de los ejercicios. Puedes revisar y no aceptar esta propuesta, pero la aceptación permanecerá deshabilitada hasta que la información esté completa.</p> : null}
    <ol className="mt-4 space-y-3">{snapshot.workouts.map(workout => <li key={workout.sourceTemplateWorkoutId} className="rounded-xl border border-border/70 bg-background/40 p-3"><h3 className="font-semibold text-foreground">Día {workout.dayOfWeek}: {workout.name}</h3><ul className="mt-2 space-y-2">{workout.exercises.map(exercise => <li key={exercise.sourceTemplateExerciseId} className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{proposal.exerciseNames[exercise.exerciseId] ?? 'Ejercicio prescrito'}</span> · {exercise.sets} series × {exercise.reps} repeticiones{exercise.weightKg !== null ? ` · ${exercise.weightKg} kg` : ''}{exercise.targetRpe !== null ? ` · RPE ${exercise.targetRpe}` : ''}{exercise.restSeconds ? ` · descanso ${exercise.restSeconds}s` : ''}{exercise.notes ? <p className="mt-1"><span className="font-semibold text-foreground">Indicación del entrenador:</span> {exercise.notes}</p> : null}</li>)}</ul></li>)}</ol>
    <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
      {!proposal.exerciseDetailsAvailable
        ? <p>No puedes aceptar una rutina con detalles incompletos; aún puedes cerrar la propuesta con «No aceptar rutina».</p>
        : canAccept
          ? <p>Al aceptar, esta será tu rutina principal. Podrás ejecutarla y registrar resultados, pero no modificar sus ejercicios ni indicaciones.</p>
          : <p>Este acompañamiento ya no está activo. No puedes aceptar esta rutina; solo puedes cerrar la propuesta con «No aceptar rutina».</p>}
      <div className="mt-3">
        <label htmlFor={`decline-reason-${proposal.assignmentId}`} className="font-medium text-foreground">Motivo opcional</label>
        <p id={`decline-reason-help-${proposal.assignmentId}`} className="mt-1 text-xs text-muted-foreground">Puedes explicar brevemente qué necesitas que cambie.</p>
        <textarea
          id={`decline-reason-${proposal.assignmentId}`}
          value={declineReason}
          onChange={event => setDeclineReason(event.target.value)}
          maxLength={500}
          rows={3}
          disabled={isMutating || isTerminal}
          aria-describedby={`decline-reason-help-${proposal.assignmentId}`}
          className="mt-2 w-full resize-y rounded-lg border border-border bg-background/70 px-3 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
      {error ? <p role="alert" className="mt-2 text-red-300">{error}</p> : null}
      {isAccepting ? <p role="status" className="mt-2 text-violet-200">Activando rutina…</p> : null}
      {isDeclining ? <p role="status" className="mt-2 text-violet-200">Cerrando propuesta…</p> : null}
      {accepted ? <p role="status" className="mt-2 text-emerald-300">Rutina activada. Actualizando tu plan…</p> : null}
      {declined ? <p role="status" className="mt-2 text-emerald-300">Rutina no aceptada. Actualizando propuestas…</p> : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {canAccept ? <button type="button" onClick={accept} disabled={isMutating || isTerminal} className="min-h-11 rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
          {isAccepting ? 'Activando…' : accepted ? 'Rutina activada' : 'Aceptar rutina'}
        </button> : null}
        <button type="button" onClick={decline} disabled={isMutating || isTerminal} className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60">
          {isDeclining ? 'No aceptando…' : declined ? 'Rutina no aceptada' : 'No aceptar rutina'}
        </button>
      </div>
    </div>
  </section>
}
