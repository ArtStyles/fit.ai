import type { TrainerProgramSnapshotV1 } from '@/lib/coaching/programs'

export type ProposedProgramReviewView = {
  assignmentId: string
  versionNumber: number
  trainerName: string
  snapshot: TrainerProgramSnapshotV1
  exerciseNames: Record<string, string>
}

/** Read-only client view. Acceptance is deliberately added in the following task. */
export function ProposedProgramReview({ proposal }: { proposal: ProposedProgramReviewView }) {
  const { snapshot } = proposal
  return <section className="mt-6 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4" aria-labelledby={`proposed-program-${proposal.assignmentId}`}>
    <p className="text-sm font-semibold text-violet-300">Rutina profesional propuesta</p>
    <h2 id={`proposed-program-${proposal.assignmentId}`} className="mt-1 text-xl font-bold text-foreground">{snapshot.name}</h2>
    <p className="mt-1 text-sm text-muted-foreground">Enviada por {proposal.trainerName} · versión {proposal.versionNumber}</p>
    {snapshot.goal ? <p className="mt-3 text-sm text-foreground"><span className="font-semibold">Objetivo:</span> {snapshot.goal}</p> : null}
    {snapshot.description ? <p className="mt-2 text-sm text-muted-foreground">{snapshot.description}</p> : null}
    <p className="mt-3 text-sm text-muted-foreground">{snapshot.daysPerWeek} días por semana. Esta prescripción se mantiene bloqueada: podrás ejecutarla, pero no editar ejercicios ni sus indicaciones.</p>
    <ol className="mt-4 space-y-3">{snapshot.workouts.map(workout => <li key={workout.sourceTemplateWorkoutId} className="rounded-xl border border-border/70 bg-background/40 p-3"><h3 className="font-semibold text-foreground">Día {workout.dayOfWeek}: {workout.name}</h3><ul className="mt-2 space-y-2">{workout.exercises.map(exercise => <li key={exercise.sourceTemplateExerciseId} className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{proposal.exerciseNames[exercise.exerciseId] ?? 'Ejercicio prescrito'}</span> · {exercise.sets} series × {exercise.reps} repeticiones{exercise.weightKg !== null ? ` · ${exercise.weightKg} kg` : ''}{exercise.targetRpe !== null ? ` · RPE ${exercise.targetRpe}` : ''}{exercise.restSeconds ? ` · descanso ${exercise.restSeconds}s` : ''}{exercise.notes ? ` · ${exercise.notes}` : ''}</li>)}</ul></li>)}</ol>
    <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">La aceptación de esta propuesta se habilitará aquí; por ahora es solo de lectura.</p>
  </section>
}
