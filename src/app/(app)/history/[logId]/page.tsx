import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Clock,
  Dumbbell,
  Flame,
  Info,
  Repeat2,
  Target,
  Trophy,
  Weight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PendingLink } from '@/components/navigation/PendingLink'
import { requireAppUserContext } from '@/lib/auth/server'
import { getWorkoutDisplayName } from '@/lib/workouts/display'

export const metadata = { title: 'Detalle de sesión · FitAI' }

type WorkoutSummary = {
  name: string
  focus: string | null
}

type ProgressLogRow = {
  id: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  notes: string | null
  mood_rating: number | null
  energy_rating: number | null
  workout: WorkoutSummary | WorkoutSummary[] | null
}

type ExerciseSummary = {
  name: string
  muscle_groups: string[] | null
  is_compound: boolean | null
}

type ExerciseLogRow = {
  id: string
  exercise_id: string
  sets_completed: number | null
  reps_completed: number[] | null
  weights_kg: number[] | null
  rpe_values: (number | null)[] | null
  duration_seconds: number | null
  notes: string | null
  exercise: ExerciseSummary | ExerciseSummary[] | null
}

type PreviousExerciseLogRow = {
  exercise_id: string
  weights_kg: number[] | null
}

interface PageProps {
  params: { logId: string }
}

function getWorkout(row: ProgressLogRow): WorkoutSummary | null {
  if (Array.isArray(row.workout)) return row.workout[0] ?? null
  return row.workout
}

function getExercise(row: ExerciseLogRow): ExerciseSummary | null {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null
  return row.exercise
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '0 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
}

function formatWeight(value: number): string {
  return Number.isInteger(value) ? `${value} kg` : `${value.toFixed(1)} kg`
}

function volumeFor(row: ExerciseLogRow): number {
  const weights = row.weights_kg ?? []
  const reps = row.reps_completed ?? []

  return weights.reduce((sum, weight, index) => {
    return sum + (Number(weight) || 0) * (Number(reps[index]) || 0)
  }, 0)
}

function maxWeight(row: ExerciseLogRow | PreviousExerciseLogRow): number {
  return Math.max(...(row.weights_kg ?? []).map(weight => Number(weight) || 0), 0)
}

function averageRpe(row: ExerciseLogRow): number | null {
  const values = (row.rpe_values ?? []).filter((value): value is number => typeof value === 'number')
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
}

function isSkipped(row: ExerciseLogRow): boolean {
  return (row.sets_completed ?? 0) === 0 && Boolean(row.notes?.toLowerCase().startsWith('saltado:'))
}

function noteKind(note: string | null): 'skip' | 'added' | 'replacement' | null {
  const normalized = note?.toLowerCase() ?? ''
  if (normalized.startsWith('saltado:')) return 'skip'
  if (normalized.includes('agregado solo por hoy')) return 'added'
  if (normalized.includes('cambio solo por hoy')) return 'replacement'
  return null
}

function setRows(row: ExerciseLogRow) {
  const weights = row.weights_kg ?? []
  const reps = row.reps_completed ?? []
  const rpes = row.rpe_values ?? []
  const length = Math.max(weights.length, reps.length, rpes.length)

  return Array.from({ length }, (_, index) => ({
    weight: Number(weights[index]) || 0,
    reps: Number(reps[index]) || 0,
    rpe: rpes[index] ?? null,
  }))
}

export default async function HistoryDetailPage({ params }: PageProps) {
  const { supabase, user } = await requireAppUserContext()

  const { data: log } = await supabase
    .from('progress_logs')
    .select(`
      id,
      workout_id,
      completed_at,
      duration_minutes,
      notes,
      mood_rating,
      energy_rating,
      workout:workouts(name, focus)
    `)
    .eq('id', params.logId)
    .eq('user_id', user.id)
    .maybeSingle() as unknown as { data: ProgressLogRow | null }

  if (!log) notFound()

  const { data: exerciseLogRows } = await supabase
    .from('exercise_logs')
    .select(`
      id,
      exercise_id,
      sets_completed,
      reps_completed,
      weights_kg,
      rpe_values,
      duration_seconds,
      notes,
      exercise:exercises(name, muscle_groups, is_compound)
    `)
    .eq('progress_log_id', log.id) as unknown as { data: ExerciseLogRow[] | null }

  const exerciseLogs = exerciseLogRows ?? []
  const exerciseIds = Array.from(new Set(exerciseLogs.map(row => row.exercise_id)))
  let previousLogs: PreviousExerciseLogRow[] = []

  if (exerciseIds.length > 0) {
    const { data } = await supabase
      .from('exercise_logs')
      .select('exercise_id, weights_kg, progress_logs!inner(user_id, completed_at)')
      .in('exercise_id', exerciseIds)
      .eq('progress_logs.user_id', user.id)
      .lt('progress_logs.completed_at', log.completed_at) as unknown as { data: PreviousExerciseLogRow[] | null }

    previousLogs = data ?? []
  }

  const previousMaxByExercise = previousLogs.reduce<Record<string, number>>((acc, row) => {
    acc[row.exercise_id] = Math.max(acc[row.exercise_id] ?? 0, maxWeight(row))
    return acc
  }, {})

  const workout = getWorkout(log)
  const workoutName = workout ? getWorkoutDisplayName(workout.name, workout.focus) : 'Entrenamiento'
  const completedExerciseLogs = exerciseLogs.filter(row => !isSkipped(row))
  const skippedCount = exerciseLogs.length - completedExerciseLogs.length
  const totalSets = completedExerciseLogs.reduce((sum, row) => sum + (row.sets_completed ?? 0), 0)
  const totalVolume = Math.round(completedExerciseLogs.reduce((sum, row) => sum + volumeFor(row), 0))
  const prCount = completedExerciseLogs.filter(row => maxWeight(row) > (previousMaxByExercise[row.exercise_id] ?? 0)).length

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto max-w-lg px-4 py-8">
        <PendingLink
          href="/history"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
          showSpinner={false}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Historial
        </PendingLink>

        <header className="animate-in fade-in slide-in-from-bottom-3 mt-6 duration-500">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/80">
            Sesión completada
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-foreground">
            {workoutName}
          </h1>
          <p className="mt-2 text-sm capitalize text-muted-foreground">
            {formatDateTime(log.completed_at)}
          </p>
          {workout?.focus && (
            <p className="mt-2 text-sm text-muted-foreground">{workout.focus}</p>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <Clock className="h-4 w-4 text-violet-300" />
              <p className="mt-2 text-lg font-semibold text-foreground">{formatDuration(log.duration_minutes)}</p>
              <p className="text-xs text-muted-foreground">Duración</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <Dumbbell className="h-4 w-4 text-violet-300" />
              <p className="mt-2 text-lg font-semibold text-foreground">{totalSets}</p>
              <p className="text-xs text-muted-foreground">Series</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <Weight className="h-4 w-4 text-violet-300" />
              <p className="mt-2 text-lg font-semibold text-foreground">{totalVolume}kg</p>
              <p className="text-xs text-muted-foreground">Volumen</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {log.mood_rating && (
              <Badge variant="ghost" className="border border-border/50">
                Ánimo {log.mood_rating}/5
              </Badge>
            )}
            {prCount > 0 && (
              <Badge variant="ghost" className="border border-yellow-500/30 bg-yellow-500/10 text-yellow-200">
                <Trophy className="mr-1 h-3 w-3" />
                {prCount} PR{prCount === 1 ? '' : 's'}
              </Badge>
            )}
            {skippedCount > 0 && (
              <Badge variant="ghost" className="border border-amber-500/30 bg-amber-500/10 text-amber-200">
                {skippedCount} saltado{skippedCount === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        </header>

        {exerciseLogs.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <Info className="mx-auto h-7 w-7 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-semibold text-foreground">Sin detalle de ejercicios</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Esta sesión no tiene logs por ejercicio.
            </p>
          </section>
        ) : (
          <section className="mt-8 space-y-3">
            {exerciseLogs.map((row, index) => {
              const exercise = getExercise(row)
              const rows = setRows(row)
              const volume = Math.round(volumeFor(row))
              const currentMax = maxWeight(row)
              const previousMax = previousMaxByExercise[row.exercise_id] ?? 0
              const isPr = currentMax > previousMax && currentMax > 0
              const kind = noteKind(row.notes)
              const avgRpe = averageRpe(row)
              const skipped = isSkipped(row)

              return (
                <article
                  key={row.id}
                  className="animate-in fade-in slide-in-from-bottom-3 rounded-2xl border border-border/60 bg-muted/10 p-4 duration-500"
                  style={{ animationDelay: `${Math.min(index * 60, 360)}ms` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-foreground">
                          {exercise?.name ?? 'Ejercicio'}
                        </h2>
                        {exercise?.is_compound && (
                          <Badge variant="secondary" className="border-0 bg-muted/30 text-[10px] text-muted-foreground">
                            compuesto
                          </Badge>
                        )}
                        {kind === 'added' && (
                          <Badge variant="ghost" className="border border-violet-500/20 bg-violet-500/10 text-[10px] text-violet-200">
                            solo hoy
                          </Badge>
                        )}
                        {kind === 'replacement' && (
                          <Badge variant="ghost" className="border border-violet-500/20 bg-violet-500/10 text-[10px] text-violet-200">
                            <Repeat2 className="mr-1 h-3 w-3" />
                            cambio
                          </Badge>
                        )}
                        {isPr && (
                          <Badge variant="ghost" className="border border-yellow-500/30 bg-yellow-500/10 text-[10px] text-yellow-200">
                            PR
                          </Badge>
                        )}
                      </div>
                      {exercise?.muscle_groups && exercise.muscle_groups.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {exercise.muscle_groups.slice(0, 3).join(' · ')}
                        </p>
                      )}
                      <PendingLink
                        href={`/exercises/${row.exercise_id}`}
                        className="mt-2 inline-flex text-xs font-medium text-violet-300 underline-offset-4 hover:underline"
                        spinnerClassName="h-3 w-3"
                      >
                        Ver progreso del ejercicio
                      </PendingLink>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">
                        {skipped ? 'Saltado' : `${row.sets_completed ?? rows.length} sets`}
                      </p>
                      {!skipped && (
                        <p className="text-xs text-muted-foreground">{volume} kg</p>
                      )}
                    </div>
                  </div>

                  {row.notes && (
                    <div className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                      kind === 'skip'
                        ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                        : 'border-violet-500/20 bg-violet-500/10 text-violet-200'
                    }`}>
                      {row.notes}
                    </div>
                  )}

                  {!skipped && rows.length > 0 && (
                    <div className="mt-4 overflow-hidden rounded-xl border border-border/50">
                      <div className="grid grid-cols-4 bg-background/70 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Set</span>
                        <span className="text-center">Peso</span>
                        <span className="text-center">Reps</span>
                        <span className="text-right">RPE</span>
                      </div>
                      {rows.map((set, setIndex) => (
                        <div
                          key={setIndex}
                          className="grid grid-cols-4 border-t border-border/40 px-3 py-2 text-xs text-foreground"
                        >
                          <span>{setIndex + 1}</span>
                          <span className="text-center tabular-nums">{formatWeight(set.weight)}</span>
                          <span className="text-center tabular-nums">{set.reps}</span>
                          <span className="text-right tabular-nums">{set.rpe ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {!skipped && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {currentMax > 0 && (
                        <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                          <Target className="mr-1 h-3.5 w-3.5" />
                          mejor {formatWeight(currentMax)}
                        </span>
                      )}
                      {avgRpe !== null && (
                        <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                          <Flame className="mr-1 h-3.5 w-3.5" />
                          RPE prom. {avgRpe}
                        </span>
                      )}
                      {previousMax > 0 && (
                        <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                          anterior {formatWeight(previousMax)}
                        </span>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </section>
        )}
      </main>
    </div>
  )
}
