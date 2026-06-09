import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Clock,
  Dumbbell,
  Flame,
  History,
  Info,
  Target,
  TrendingUp,
  Trophy,
  Weight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import { PendingLink } from '@/components/navigation/PendingLink'
import { requireAppUserContext } from '@/lib/auth/server'
import { getWorkoutDisplayName } from '@/lib/workouts/display'
import type { Database } from '@/types/database'

export const metadata = { title: 'Ejercicio · FitAI' }

type ExerciseRow = {
  id: string
  name: string
  description: string | null
  muscle_groups: string[] | null
  equipment: string[] | null
  difficulty: string | null
  exercise_type: string | null
  is_compound: boolean | null
  instructions: string | null
  video_url: string | null
  image_url: string | null
}

type EmbeddedProgressLog = {
  id: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  mood_rating: number | null
}

type ExerciseLogRow = {
  id: string
  progress_log_id: string
  sets_completed: number | null
  reps_completed: number[] | null
  weights_kg: number[] | null
  rpe_values: (number | null)[] | null
  notes: string | null
  progress_log: EmbeddedProgressLog | EmbeddedProgressLog[] | null
}

type WorkoutRow = {
  id: string
  name: string
  focus: string | null
}

type SetRow = {
  weight: number
  reps: number
  rpe: number | null
}

type ExerciseStats = {
  sessions: number
  totalSets: number
  totalVolumeKg: number
  maxWeightKg: number
  repsAtMaxWeight: number
  maxReps: number
  averageRpe: number | null
}

type ProgressPoint = {
  logId: string
  dateLabel: string
  completedAt: string
  maxWeightKg: number
  volumeKg: number
  averageRpe: number | null
}

interface PageProps {
  params: { exerciseId: string }
}

type AppSupabaseClient = Awaited<ReturnType<typeof requireAppUserContext>>['supabase']

type ExerciseDetailRpc = Database['public']['Functions']['get_exercise_detail_payload']

type ExerciseDetailRpcClient = {
  rpc: (
    functionName: 'get_exercise_detail_payload',
    args: ExerciseDetailRpc['Args'],
  ) => Promise<{ data: ExerciseDetailRpc['Returns'] | null; error: { message?: string } | null }>
}

type ExerciseDetailPayloadResult = {
  exercise: ExerciseRow | null
  logs: ExerciseLogRow[]
  workoutsById: Record<string, WorkoutRow>
}

function getProgressLog(row: ExerciseLogRow): EmbeddedProgressLog | null {
  if (Array.isArray(row.progress_log)) return row.progress_log[0] ?? null
  return row.progress_log
}

function sortExerciseLogs(rows: ExerciseLogRow[]): ExerciseLogRow[] {
  return rows
    .filter(row => getProgressLog(row))
    .sort((a, b) => {
      const aLog = getProgressLog(a)!
      const bLog = getProgressLog(b)!
      return new Date(bLog.completed_at).getTime() - new Date(aLog.completed_at).getTime()
    })
}

function indexWorkouts(rows: WorkoutRow[]): Record<string, WorkoutRow> {
  return rows.reduce<Record<string, WorkoutRow>>((acc, workout) => {
    acc[workout.id] = workout
    return acc
  }, {})
}

async function loadExerciseDetailPayloadFallback(
  supabase: AppSupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<ExerciseDetailPayloadResult> {
  const { data: exercise } = await supabase
    .from('exercises')
    .select('id, name, description, muscle_groups, equipment, difficulty, exercise_type, is_compound, instructions, video_url, image_url')
    .eq('id', exerciseId)
    .eq('is_public', true)
    .maybeSingle() as unknown as { data: ExerciseRow | null }

  if (!exercise) {
    return { exercise: null, logs: [], workoutsById: {} }
  }

  const { data: rawLogs } = await supabase
    .from('exercise_logs')
    .select(`
      id,
      progress_log_id,
      sets_completed,
      reps_completed,
      weights_kg,
      rpe_values,
      notes,
      progress_log:progress_logs!inner(id, workout_id, completed_at, duration_minutes, mood_rating, user_id)
    `)
    .eq('exercise_id', exercise.id)
    .eq('progress_logs.user_id', userId) as unknown as { data: ExerciseLogRow[] | null }

  const logs = sortExerciseLogs(rawLogs ?? [])
  const workoutIds = Array.from(new Set(
    logs
      .map(row => getProgressLog(row)?.workout_id)
      .filter((id): id is string => Boolean(id)),
  ))
  let workoutsById: Record<string, WorkoutRow> = {}

  if (workoutIds.length > 0) {
    const { data: workouts } = await supabase
      .from('workouts')
      .select('id, name, focus')
      .in('id', workoutIds)
      .eq('user_id', userId) as unknown as { data: WorkoutRow[] | null }

    workoutsById = indexWorkouts(workouts ?? [])
  }

  return { exercise, logs, workoutsById }
}

async function loadExerciseDetailPayload(
  supabase: AppSupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<ExerciseDetailPayloadResult> {
  try {
    const { data, error } = await (supabase as unknown as ExerciseDetailRpcClient)
      .rpc('get_exercise_detail_payload', { p_exercise_id: exerciseId })

    if (!error && data) {
      return {
        exercise: data.exercise ?? null,
        logs: sortExerciseLogs(data.logs ?? []),
        workoutsById: indexWorkouts(data.workouts ?? []),
      }
    }
  } catch {
    // The migration may not be applied locally yet; fallback keeps the screen usable.
  }

  return loadExerciseDetailPayloadFallback(supabase, userId, exerciseId)
}

function cleanText(value: string | null): string {
  if (!value) return ''
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function formatWeight(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Sin carga'
  return Number.isInteger(value) ? `${value} kg` : `${value.toFixed(1)} kg`
}

function setRows(row: ExerciseLogRow): SetRow[] {
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

function volumeFor(row: ExerciseLogRow): number {
  return setRows(row).reduce((sum, set) => sum + set.weight * set.reps, 0)
}

function maxWeightFor(row: ExerciseLogRow): number {
  return Math.max(...(row.weights_kg ?? []).map(weight => Number(weight) || 0), 0)
}

function averageRpeFor(row: ExerciseLogRow): number | null {
  const values = (row.rpe_values ?? []).filter((value): value is number => typeof value === 'number')
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function buildStats(rows: ExerciseLogRow[]): ExerciseStats {
  let maxWeightKg = 0
  let repsAtMaxWeight = 0
  let maxReps = 0
  const rpes: number[] = []

  for (const row of rows) {
    const sets = setRows(row)
    for (const set of sets) {
      if (set.weight > maxWeightKg || (set.weight === maxWeightKg && set.reps > repsAtMaxWeight)) {
        maxWeightKg = set.weight
        repsAtMaxWeight = set.reps
      }
      maxReps = Math.max(maxReps, set.reps)
      if (typeof set.rpe === 'number') rpes.push(set.rpe)
    }
  }

  return {
    sessions: rows.length,
    totalSets: rows.reduce((sum, row) => sum + (row.sets_completed ?? setRows(row).length), 0),
    totalVolumeKg: Math.round(rows.reduce((sum, row) => sum + volumeFor(row), 0)),
    maxWeightKg,
    repsAtMaxWeight,
    maxReps,
    averageRpe: rpes.length > 0
      ? Math.round((rpes.reduce((sum, value) => sum + value, 0) / rpes.length) * 10) / 10
      : null,
  }
}

function buildProgressPoints(rows: ExerciseLogRow[]): ProgressPoint[] {
  return rows
    .slice(0, 8)
    .map(row => {
      const progressLog = getProgressLog(row)!
      const avgRpe = averageRpeFor(row)

      return {
        logId: progressLog.id,
        dateLabel: new Intl.DateTimeFormat('es', {
          day: 'numeric',
          month: 'short',
        }).format(new Date(progressLog.completed_at)),
        completedAt: progressLog.completed_at,
        maxWeightKg: maxWeightFor(row),
        volumeKg: Math.round(volumeFor(row)),
        averageRpe: avgRpe === null ? null : Math.round(avgRpe * 10) / 10,
      }
    })
    .reverse()
}

function getTrend(rows: ExerciseLogRow[]): 'up' | 'same' | 'down' | 'baseline' {
  if (rows.length < 2) return 'baseline'

  const latest = maxWeightFor(rows[0])
  const previous = maxWeightFor(rows[1])
  if (latest > previous) return 'up'
  if (latest < previous) return 'down'
  return 'same'
}

function trendCopy(trend: ReturnType<typeof getTrend>): string {
  if (trend === 'up') return 'Vienes subiendo carga en este ejercicio.'
  if (trend === 'down') return 'La última marca bajó; revisa fatiga o técnica.'
  if (trend === 'same') return 'Última marca estable; buen momento para consolidar.'
  return 'Aún estás creando tu baseline para este ejercicio.'
}

function bestVsLatestCopy(points: ProgressPoint[]): string {
  if (points.length === 0) return 'Aún no hay datos para comparar.'

  const latest = points[points.length - 1]
  const best = points.reduce((currentBest, point) => {
    if (point.maxWeightKg > currentBest.maxWeightKg) return point
    return currentBest
  }, points[0])

  if (latest.maxWeightKg <= 0) return 'La última sesión no tiene carga registrada.'
  if (latest.maxWeightKg >= best.maxWeightKg) return 'Tu última sesión está en tu mejor marca.'

  const diff = Math.round((best.maxWeightKg - latest.maxWeightKg) * 10) / 10
  return `Tu última sesión quedó ${formatWeight(diff)} por debajo de tu mejor marca.`
}

function ProgressChart({ points }: { points: ProgressPoint[] }) {
  if (points.length === 0) return null

  const maxWeight = Math.max(...points.map(point => point.maxWeightKg), 0)
  const maxVolume = Math.max(...points.map(point => point.volumeKg), 0)
  const latest = points[points.length - 1]
  const best = points.reduce((currentBest, point) => {
    if (point.maxWeightKg > currentBest.maxWeightKg) return point
    if (point.maxWeightKg === currentBest.maxWeightKg && point.volumeKg > currentBest.volumeKg) return point
    return currentBest
  }, points[0])

  return (
    <section className="animate-in fade-in slide-in-from-bottom-3 mt-6 rounded-2xl border border-border/60 bg-muted/10 p-4 duration-500">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Progreso visual</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Peso máximo por sesión. Toca una barra para abrir el entrenamiento.
          </p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
          <BarChart3 className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-5 flex h-32 items-end gap-2 rounded-xl border border-border/50 bg-background/40 px-3 pb-3 pt-4">
        {points.map((point, index) => {
          const height = maxWeight > 0
            ? Math.max(12, Math.round((point.maxWeightKg / maxWeight) * 100))
            : 12
          const isBest = point.logId === best.logId
          const isLatest = point.logId === latest.logId

          return (
            <PendingLink
              key={`${point.logId}-${index}`}
              href={`/history/${point.logId}`}
              className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
              showSpinner={false}
              title={`${point.dateLabel}: ${formatWeight(point.maxWeightKg)}`}
            >
              <span className="sr-only">
                {point.dateLabel}: {formatWeight(point.maxWeightKg)}
              </span>
              <span
                className={[
                  'w-full rounded-t-md transition-all group-hover:brightness-125',
                  isBest
                    ? 'bg-amber-400 shadow-sm shadow-amber-500/30'
                    : isLatest
                      ? 'bg-violet-400 shadow-sm shadow-violet-500/30'
                      : 'bg-violet-500/35',
                ].join(' ')}
                style={{ height: `${height}%` }}
                aria-hidden="true"
              />
              <span className="max-w-full truncate text-[10px] text-muted-foreground">
                {point.dateLabel.replace('.', '')}
              </span>
            </PendingLink>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/50 bg-background/50 p-3">
          <p className="text-[11px] text-muted-foreground">Última sesión</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatWeight(latest.maxWeightKg)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {latest.volumeKg} kg volumen{latest.averageRpe ? ` · RPE ${latest.averageRpe}` : ''}
          </p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[11px] text-muted-foreground">Mejor marca</p>
          <p className="mt-1 text-sm font-semibold text-amber-100">
            {formatWeight(best.maxWeightKg)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {best.dateLabel}{maxVolume > 0 ? ` · ${best.volumeKg} kg` : ''}
          </p>
        </div>
      </div>

      <p className="mt-3 flex items-start gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs leading-relaxed text-violet-100">
        <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {bestVsLatestCopy(points)}
      </p>
    </section>
  )
}

export default async function ExerciseDetailPage({ params }: PageProps) {
  const { supabase, user } = await requireAppUserContext()
  const { exercise, logs, workoutsById } = await loadExerciseDetailPayload(
    supabase,
    user.id,
    params.exerciseId,
  )

  if (!exercise) notFound()

  const stats = buildStats(logs)
  const trend = getTrend(logs)
  const progressPoints = buildProgressPoints(logs)
  const description = cleanText(exercise.description)
  const instructions = cleanText(exercise.instructions)
  const latestLog = logs[0] ? getProgressLog(logs[0]) : null

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
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/80">
                Ficha de ejercicio
              </p>
              <h1 className="mt-2 text-2xl font-bold leading-tight text-foreground">
                {exercise.name}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {exercise.exercise_type && (
                  <Badge variant="ghost" className="border border-border/50 capitalize">
                    {exercise.exercise_type}
                  </Badge>
                )}
                {exercise.difficulty && (
                  <Badge variant="ghost" className="border border-border/50 capitalize">
                    {exercise.difficulty}
                  </Badge>
                )}
                {exercise.is_compound && (
                  <Badge variant="ghost" className="border border-violet-500/20 bg-violet-500/10 text-violet-200">
                    compuesto
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
              <Dumbbell className="h-5 w-5" />
            </div>
          </div>
        </header>

        <ExerciseImage
          src={exercise.image_url}
          alt={exercise.name}
          variant="hero"
          zoomable
          className="animate-in fade-in slide-in-from-bottom-3 mt-6 w-full duration-500"
        />

        <section className="animate-in fade-in slide-in-from-bottom-3 mt-8 grid grid-cols-2 gap-2 duration-500">
          <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
            <History className="h-4 w-4 text-violet-300" />
            <p className="mt-2 text-lg font-semibold text-foreground">{stats.sessions}</p>
            <p className="text-xs text-muted-foreground">Sesiones</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
            <Trophy className="h-4 w-4 text-amber-300" />
            <p className="mt-2 text-lg font-semibold text-foreground">{formatWeight(stats.maxWeightKg)}</p>
            <p className="text-xs text-muted-foreground">
              {stats.repsAtMaxWeight > 0 ? `${stats.repsAtMaxWeight} reps` : 'Mejor peso'}
            </p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
            <Weight className="h-4 w-4 text-emerald-300" />
            <p className="mt-2 text-lg font-semibold text-foreground">{stats.totalVolumeKg}kg</p>
            <p className="text-xs text-muted-foreground">Volumen total</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
            <Flame className="h-4 w-4 text-orange-300" />
            <p className="mt-2 text-lg font-semibold text-foreground">
              {stats.averageRpe ?? '—'}
            </p>
            <p className="text-xs text-muted-foreground">RPE promedio</p>
          </div>
        </section>

        <section className="animate-in fade-in slide-in-from-bottom-3 mt-6 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 duration-500">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
              <Target className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Lectura rápida</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {trendCopy(trend)}
              </p>
              {latestLog && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Última vez: {formatDate(latestLog.completed_at)}
                </p>
              )}
            </div>
          </div>
        </section>

        <ProgressChart points={progressPoints} />

        {(exercise.muscle_groups?.length || exercise.equipment?.length || description || instructions) ? (
          <section className="animate-in fade-in slide-in-from-bottom-3 mt-8 space-y-4 duration-500">
            {(exercise.muscle_groups?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Músculos
                </p>
                <div className="flex flex-wrap gap-2">
                  {exercise.muscle_groups!.map(group => (
                    <span key={group} className="rounded-md border border-border/50 bg-muted/10 px-2 py-1 text-xs capitalize text-muted-foreground">
                      {group}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(exercise.equipment?.length ?? 0) > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Equipo
                </p>
                <div className="flex flex-wrap gap-2">
                  {exercise.equipment!.map(item => (
                    <span key={item} className="rounded-md border border-border/50 bg-muted/10 px-2 py-1 text-xs capitalize text-muted-foreground">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {description && (
              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                <p className="text-sm font-semibold text-foreground">Descripción</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            )}

            {instructions && (
              <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                <p className="text-sm font-semibold text-foreground">Instrucciones</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{instructions}</p>
              </div>
            )}
          </section>
        ) : null}

        <section className="animate-in fade-in slide-in-from-bottom-3 mt-8 duration-500">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Historial del ejercicio</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Últimas sesiones donde registraste este movimiento.
              </p>
            </div>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
              <Info className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-3 text-sm font-semibold text-foreground">Sin registros todavía</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Cuando completes este ejercicio, aquí verás su progreso.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.slice(0, 12).map(row => {
                const progressLog = getProgressLog(row)!
                const workout = progressLog.workout_id ? workoutsById[progressLog.workout_id] : null
                const workoutName = workout
                  ? getWorkoutDisplayName(workout.name, workout.focus)
                  : 'Entrenamiento'
                const rows = setRows(row)
                const bestWeight = maxWeightFor(row)
                const avgRpe = averageRpeFor(row)

                return (
                  <PendingLink
                    key={row.id}
                    href={`/history/${progressLog.id}`}
                    className="block rounded-2xl border border-border/60 bg-muted/10 p-4 transition-colors hover:border-violet-500/30 hover:bg-violet-500/5"
                    spinnerClassName="h-3.5 w-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium capitalize text-muted-foreground">
                          {formatDate(progressLog.completed_at)}
                        </p>
                        <p className="mt-1 truncate text-sm font-semibold text-foreground">
                          {workoutName}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-foreground">{formatWeight(bestWeight)}</p>
                        <p className="text-xs text-muted-foreground">{row.sets_completed ?? rows.length} sets</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                        <Weight className="mr-1 h-3.5 w-3.5" />
                        {Math.round(volumeFor(row))} kg
                      </span>
                      {avgRpe !== null && (
                        <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                          <Flame className="mr-1 h-3.5 w-3.5" />
                          RPE {Math.round(avgRpe * 10) / 10}
                        </span>
                      )}
                      {progressLog.duration_minutes && (
                        <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                          <Clock className="mr-1 h-3.5 w-3.5" />
                          {progressLog.duration_minutes} min
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-md bg-background/60 px-2 py-1">
                        <CalendarDays className="mr-1 h-3.5 w-3.5" />
                        ver sesión
                      </span>
                    </div>
                  </PendingLink>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
