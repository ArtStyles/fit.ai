import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock,
  Dumbbell,
  History,
  Medal,
  Trophy,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { PendingLink } from '@/components/navigation/PendingLink'
import { requireAppUserContext } from '@/lib/auth/server'
import { getWorkoutDisplayName } from '@/lib/workouts/display'

export const metadata = { title: 'Historial · FitAI' }

type WorkoutSummary = {
  name: string
  focus: string | null
}

type ProgressLogRow = {
  id: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  mood_rating: number | null
  workout: WorkoutSummary | WorkoutSummary[] | null
}

type ExerciseSummary = {
  name: string
  muscle_groups: string[] | null
  is_compound: boolean | null
}

type ExerciseLogRow = {
  progress_log_id: string
  exercise_id: string | null
  weights_kg: number[] | null
  reps_completed: number[] | null
  exercise: ExerciseSummary | ExerciseSummary[] | null
}

type PersonalRecord = {
  exerciseId: string
  exerciseName: string
  muscleGroups: string[]
  bestLogId: string
  bestCompletedAt: string
  maxWeightKg: number
  repsAtMaxWeight: number
  maxReps: number
  totalVolumeKg: number
  sessionCount: number
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value))
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('es', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatWeight(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Sin carga'
  return Number.isInteger(value) ? `${value} kg` : `${value.toFixed(1)} kg`
}

function getWorkout(row: ProgressLogRow): WorkoutSummary | null {
  if (Array.isArray(row.workout)) return row.workout[0] ?? null
  return row.workout
}

function getExercise(row: ExerciseLogRow): ExerciseSummary | null {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null
  return row.exercise
}

function volumeFor(logId: string, rows: ExerciseLogRow[]): number {
  return rows
    .filter(row => row.progress_log_id === logId)
    .reduce((total, row) => {
      const weights = row.weights_kg ?? []
      const reps = row.reps_completed ?? []
      return total + weights.reduce((sum, weight, index) => {
        return sum + (Number(weight) || 0) * (Number(reps[index]) || 0)
      }, 0)
    }, 0)
}

function buildPersonalRecords(rows: ExerciseLogRow[], logs: ProgressLogRow[]): PersonalRecord[] {
  const logById = new Map(logs.map(log => [log.id, log]))
  const records = new Map<string, PersonalRecord>()

  for (const row of rows) {
    if (!row.exercise_id) continue

    const exercise = getExercise(row)
    const log = logById.get(row.progress_log_id)
    if (!exercise || !log) continue

    const weights = row.weights_kg ?? []
    const reps = row.reps_completed ?? []
    const maxWeightKg = weights.reduce((max, weight) => Math.max(max, Number(weight) || 0), 0)
    const maxWeightIndex = weights.findIndex(weight => (Number(weight) || 0) === maxWeightKg)
    const repsAtMaxWeight = Number(reps[maxWeightIndex] ?? 0) || 0
    const maxReps = reps.reduce((max, value) => Math.max(max, Number(value) || 0), 0)
    const totalVolumeKg = weights.reduce((sum, weight, index) => {
      return sum + (Number(weight) || 0) * (Number(reps[index]) || 0)
    }, 0)

    const current = records.get(row.exercise_id)
    const isBetter =
      !current ||
      maxWeightKg > current.maxWeightKg ||
      (maxWeightKg === current.maxWeightKg && repsAtMaxWeight > current.repsAtMaxWeight) ||
      (
        maxWeightKg === current.maxWeightKg &&
        repsAtMaxWeight === current.repsAtMaxWeight &&
        new Date(log.completed_at).getTime() > new Date(current.bestCompletedAt).getTime()
      )

    records.set(row.exercise_id, {
      exerciseId: row.exercise_id,
      exerciseName: exercise.name,
      muscleGroups: exercise.muscle_groups ?? [],
      bestLogId: isBetter ? row.progress_log_id : current!.bestLogId,
      bestCompletedAt: isBetter ? log.completed_at : current!.bestCompletedAt,
      maxWeightKg: isBetter ? maxWeightKg : current!.maxWeightKg,
      repsAtMaxWeight: isBetter ? repsAtMaxWeight : current!.repsAtMaxWeight,
      maxReps: Math.max(current?.maxReps ?? 0, maxReps),
      totalVolumeKg: Math.round((current?.totalVolumeKg ?? 0) + totalVolumeKg),
      sessionCount: (current?.sessionCount ?? 0) + 1,
    })
  }

  return Array.from(records.values())
    .filter(record => record.maxWeightKg > 0 || record.maxReps > 0)
    .sort((a, b) =>
      b.maxWeightKg - a.maxWeightKg ||
      b.repsAtMaxWeight - a.repsAtMaxWeight ||
      b.totalVolumeKg - a.totalVolumeKg ||
      a.exerciseName.localeCompare(b.exerciseName),
    )
    .slice(0, 5)
}

export default async function HistoryPage() {
  const { supabase, user } = await requireAppUserContext()

  const { data: logs } = await supabase
    .from('progress_logs')
    .select(`
      id,
      workout_id,
      completed_at,
      duration_minutes,
      mood_rating,
      workout:workouts(name, focus)
    `)
    .eq('user_id', user.id)
    .not('workout_id', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(50) as unknown as { data: ProgressLogRow[] | null }

  const sessionLogs = logs ?? []
  const logIds = sessionLogs.map(log => log.id)
  let exerciseLogs: ExerciseLogRow[] = []

  if (logIds.length > 0) {
    const { data } = await supabase
      .from('exercise_logs')
      .select(`
        progress_log_id,
        exercise_id,
        weights_kg,
        reps_completed,
        exercise:exercises(name, muscle_groups, is_compound)
      `)
      .in('progress_log_id', logIds) as unknown as { data: ExerciseLogRow[] | null }

    exerciseLogs = data ?? []
  }

  const totalMinutes = sessionLogs.reduce((sum, log) => sum + (log.duration_minutes ?? 0), 0)
  const totalVolume = Math.round(sessionLogs.reduce((sum, log) => {
    return sum + volumeFor(log.id, exerciseLogs)
  }, 0))
  const personalRecords = buildPersonalRecords(exerciseLogs, sessionLogs)

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto max-w-lg px-4 py-8">
        <PendingLink
          href="/dashboard"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
          showSpinner={false}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </PendingLink>

        <header className="mt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Historial</h1>
              <p className="text-sm text-muted-foreground">Últimas sesiones completadas</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">Sesiones</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{sessionLogs.length}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">Tiempo</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{totalMinutes}m</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">Volumen</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{totalVolume}kg</p>
            </div>
          </div>
        </header>

        {sessionLogs.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
              <Trophy className="h-6 w-6 text-violet-400" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">Sin sesiones todavía</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Cuando completes tu primer entrenamiento aparecerá aquí.
            </p>
            <PendingLink
              href="/dashboard"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-600"
            >
              Ir al dashboard
            </PendingLink>
          </section>
        ) : (
          <>
            {personalRecords.length > 0 && (
              <section className="animate-in fade-in slide-in-from-bottom-3 mt-8 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 duration-500">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Records personales</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Tus mejores marcas detectadas en las sesiones guardadas.
                    </p>
                  </div>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
                    <Trophy className="h-[18px] w-[18px]" />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {personalRecords.map((record, index) => (
                    <PendingLink
                      key={record.exerciseId}
                      href={`/history/${record.bestLogId}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/15 bg-background/50 px-3 py-3 transition-colors hover:border-amber-400/40 hover:bg-amber-500/10"
                      spinnerClassName="h-3 w-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-xs font-bold text-amber-300">
                          {index === 0 ? <Medal className="h-4 w-4" /> : index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {record.exerciseName}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {record.muscleGroups.slice(0, 2).join(' · ') || `${record.sessionCount} sesiones`}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-amber-200">
                          {formatWeight(record.maxWeightKg)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {record.repsAtMaxWeight > 0
                            ? `${record.repsAtMaxWeight} reps`
                            : `${record.maxReps} reps`}
                        </p>
                      </div>
                    </PendingLink>
                  ))}
                </div>
              </section>
            )}

            <div className="mt-8 space-y-3">
              {sessionLogs.map(log => {
                const workout = getWorkout(log)
                const workoutName = workout
                  ? getWorkoutDisplayName(workout.name, workout.focus)
                  : 'Entrenamiento'
                const volume = Math.round(volumeFor(log.id, exerciseLogs))

                return (
                  <PendingLink
                    key={log.id}
                    href={`/history/${log.id}`}
                    className="block rounded-2xl border border-border/60 bg-muted/10 p-4 transition-colors hover:border-violet-500/30 hover:bg-violet-500/5"
                    spinnerClassName="h-3.5 w-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium capitalize text-muted-foreground">
                          {formatDate(log.completed_at)} · {formatTime(log.completed_at)}
                        </p>
                        <h2 className="mt-1 text-base font-semibold text-foreground">
                          {workoutName}
                        </h2>
                        {workout?.focus && (
                          <p className="mt-1 text-sm text-muted-foreground">{workout.focus}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {log.mood_rating && (
                          <Badge variant="ghost" className="border border-border/50">
                            ánimo {log.mood_rating}/5
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                        <Clock className="mr-1 h-3.5 w-3.5" />
                        {log.duration_minutes ?? 0} min
                      </span>
                      <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                        <Dumbbell className="mr-1 h-3.5 w-3.5" />
                        {volume} kg
                      </span>
                      <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                        <CalendarDays className="mr-1 h-3.5 w-3.5" />
                        completado
                      </span>
                    </div>
                  </PendingLink>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
