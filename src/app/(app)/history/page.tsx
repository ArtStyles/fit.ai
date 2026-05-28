import { ArrowLeft, CalendarDays, Clock, Dumbbell, History, Trophy } from 'lucide-react'
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

type ExerciseLogRow = {
  progress_log_id: string
  weights_kg: number[] | null
  reps_completed: number[] | null
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

function getWorkout(row: ProgressLogRow): WorkoutSummary | null {
  if (Array.isArray(row.workout)) return row.workout[0] ?? null
  return row.workout
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
      .select('progress_log_id, weights_kg, reps_completed')
      .in('progress_log_id', logIds) as unknown as { data: ExerciseLogRow[] | null }

    exerciseLogs = data ?? []
  }

  const totalMinutes = sessionLogs.reduce((sum, log) => sum + (log.duration_minutes ?? 0), 0)
  const totalVolume = Math.round(sessionLogs.reduce((sum, log) => {
    return sum + volumeFor(log.id, exerciseLogs)
  }, 0))

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
          <div className="mt-8 space-y-3">
            {sessionLogs.map(log => {
              const workout = getWorkout(log)
              const workoutName = workout
                ? getWorkoutDisplayName(workout.name, workout.focus)
                : 'Entrenamiento'
              const volume = Math.round(volumeFor(log.id, exerciseLogs))

              return (
                <article
                  key={log.id}
                  className="rounded-2xl border border-border/60 bg-muted/10 p-4"
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
                    {log.mood_rating && (
                      <Badge variant="ghost" className="border border-border/50">
                        ánimo {log.mood_rating}/5
                      </Badge>
                    )}
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
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
