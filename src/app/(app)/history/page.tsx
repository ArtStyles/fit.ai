import {
  ArrowLeft,
  CalendarRange,
  History,
  Medal,
  Trophy,
} from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { HistorySessionList } from '@/components/history/HistorySessionList'
import { ExerciseProgressionSection } from '@/components/history/ExerciseProgressionSection'
import { requireAppUserContext } from '@/lib/auth/server'
import type { Database } from '@/types/database'
import type { TrackedExercise } from '@/app/actions/progression'
import { exerciseLanguage, localizeExercise, type ExerciseLanguage } from '@/lib/exercises/localization'

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
  name_es?: string | null
  muscle_groups: string[] | null
  muscle_groups_es?: string[] | null
  is_compound: boolean | null
}

type ExerciseLogRow = {
  progress_log_id: string
  exercise_id: string | null
  weights_kg: number[] | null
  reps_completed: number[] | null
  exercise: ExerciseSummary | ExerciseSummary[] | null
}

type AppSupabaseClient = Awaited<ReturnType<typeof requireAppUserContext>>['supabase']

type HistoryRpc = Database['public']['Functions']['get_history_payload']

type HistoryRpcClient = {
  rpc: (
    functionName: 'get_history_payload',
    args: HistoryRpc['Args'],
  ) => Promise<{ data: HistoryRpc['Returns'] | null; error: { message?: string } | null }>
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

function formatWeight(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Sin carga'
  return Number.isInteger(value) ? `${value} kg` : `${value.toFixed(1)} kg`
}

function getExercise(row: ExerciseLogRow): ExerciseSummary | null {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null
  return row.exercise
}

async function loadHistoryPayloadFallback(
  supabase: AppSupabaseClient,
  userId: string,
  language: ExerciseLanguage,
): Promise<{ sessionLogs: ProgressLogRow[]; exerciseLogs: ExerciseLogRow[] }> {
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
    .eq('user_id', userId)
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
        exercise:exercises(name, name_es, muscle_groups, muscle_groups_es, is_compound)
      `)
      .in('progress_log_id', logIds) as unknown as { data: ExerciseLogRow[] | null }

    exerciseLogs = (data ?? []).map(row => ({
      ...row,
      exercise: Array.isArray(row.exercise)
        ? row.exercise.map(exercise => localizeExercise(exercise, language))
        : row.exercise
          ? localizeExercise(row.exercise, language)
          : null,
    }))
  }

  return { sessionLogs, exerciseLogs }
}

async function loadHistoryPayload(
  supabase: AppSupabaseClient,
  userId: string,
  language: ExerciseLanguage,
): Promise<{ sessionLogs: ProgressLogRow[]; exerciseLogs: ExerciseLogRow[] }> {
  try {
    const { data, error } = await (supabase as unknown as HistoryRpcClient)
      .rpc('get_history_payload', { p_limit: 50 })

    if (!error && data) {
      return {
        sessionLogs: data.session_logs ?? [],
        exerciseLogs: data.exercise_logs ?? [],
      }
    }
  } catch {
    // The migration may not be applied locally yet; fallback keeps the screen usable.
  }

  return loadHistoryPayloadFallback(supabase, userId, language)
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
  const { supabase, user, profile } = await requireAppUserContext()
  const { sessionLogs, exerciseLogs } = await loadHistoryPayload(
    supabase,
    user.id,
    exerciseLanguage(profile.language),
  )

  const totalMinutes = sessionLogs.reduce((sum, log) => sum + (log.duration_minutes ?? 0), 0)
  const totalVolume = Math.round(sessionLogs.reduce((sum, log) => {
    return sum + volumeFor(log.id, exerciseLogs)
  }, 0))
  const personalRecords = buildPersonalRecords(exerciseLogs, sessionLogs)

  // Deduplicate tracked exercises for the progression chart selector
  const exerciseCountById = new Map<string, number>()
  const exerciseMetaById  = new Map<string, { name: string; muscleGroups: string[] }>()
  for (const row of exerciseLogs) {
    if (!row.exercise_id) continue
    const ex = getExercise(row)
    if (!ex) continue
    exerciseCountById.set(row.exercise_id, (exerciseCountById.get(row.exercise_id) ?? 0) + 1)
    if (!exerciseMetaById.has(row.exercise_id)) {
      exerciseMetaById.set(row.exercise_id, { name: ex.name, muscleGroups: ex.muscle_groups ?? [] })
    }
  }
  const trackedExercises: TrackedExercise[] = Array.from(exerciseCountById.entries())
    .map(([id, sessionCount]) => ({ id, sessionCount, ...exerciseMetaById.get(id)! }))
    .sort((a, b) => b.sessionCount - a.sessionCount)

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto max-w-lg px-4 py-8">
        <div className="flex items-center justify-between">
          <PendingLink
            href="/dashboard"
            className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
            showSpinner={false}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </PendingLink>
          <PendingLink
            href="/calendario"
            className="inline-flex items-center text-sm font-medium text-violet-400 hover:underline"
            showSpinner={false}
          >
            <CalendarRange className="mr-1.5 h-4 w-4" />
            Calendario
          </PendingLink>
        </div>

        <header className="mt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">Historial</h1>
              <p className="text-sm text-muted-foreground">Últimas sesiones completadas</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">Sesiones</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{sessionLogs.length}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">Tiempo</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{totalMinutes}m</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
              <p className="text-xs text-muted-foreground">Volumen</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{totalVolume}kg</p>
            </div>
          </div>
        </header>

        {sessionLogs.length === 0 ? (
          <section className="mt-8 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-500/10">
              <Trophy className="h-6 w-6 text-violet-400" />
            </div>
            <h2 className="mt-4 font-display text-xl font-bold text-foreground">Sin sesiones todavía</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Cuando completes tu primer entrenamiento aparecerá aquí.
            </p>
            <PendingLink
              href="/dashboard"
              className="mt-5 inline-flex h-11 items-center justify-center rounded-md bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-600"
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
                      href={`/exercises/${record.exerciseId}`}
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

            {trackedExercises.length >= 2 && (
              <ExerciseProgressionSection exercises={trackedExercises} />
            )}

            <HistorySessionList sessionLogs={sessionLogs} exerciseLogs={exerciseLogs} />
          </>
        )}
      </main>
    </div>
  )
}
