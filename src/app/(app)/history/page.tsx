import { CalendarRange, History, Trophy } from 'lucide-react'
import { EvidenceHero } from '@/components/evidence/EvidenceHero'
import { MetricStrip } from '@/components/evidence/MetricStrip'
import { HistoryHighlights, type HistoryHighlight } from '@/components/history/HistoryHighlights'
import { HistorySessionList } from '@/components/history/HistorySessionList'
import {
  buildHistoryEvidence,
  type HistoryExerciseInput,
  type HistorySessionInput,
} from '@/components/history/historyViewModel'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { PendingLink } from '@/components/navigation/PendingLink'
import { requireAppUserContext } from '@/lib/auth/server'
import { resolveHistoricalExercisePresentation } from '@/lib/exercises/historyPresentation'
import { exerciseLanguage, type ExerciseLanguage } from '@/lib/exercises/localization'
import { createTranslator } from '@/lib/i18n'
import { toCompletedSessionPresentation, type CompletedSessionWorkoutRelation } from '@/lib/session/historyRows'
import { summarizeExercisePerformance } from '@/lib/training-evidence/performance'
import { getWorkoutDisplayName } from '@/lib/workouts/display'
import { getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'

export const metadata = { title: 'Historial · Vekira' }

type WorkoutSummary = CompletedSessionWorkoutRelation

type ProgressLogRow = {
  id: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  mood_rating: number | null
  session_context_snapshot: unknown
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
  sets_completed: number | null
  weights_kg: number[] | null
  reps_completed: number[] | null
  rpe_values: (number | null)[] | null
  notes: string | null
  exercise: ExerciseSummary | ExerciseSummary[] | null
}

type AppSupabaseClient = Awaited<ReturnType<typeof requireAppUserContext>>['supabase']

function getExercise(row: ExerciseLogRow): ExerciseSummary | null {
  return Array.isArray(row.exercise) ? row.exercise[0] ?? null : row.exercise
}

async function loadHistoryPayload(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<{ sessionLogs: ProgressLogRow[]; exerciseLogs: ExerciseLogRow[] }> {
  const { data: logs, error: logsError } = await supabase
    .from('progress_logs')
    .select(`
      id,
      workout_id,
      completed_at,
      duration_minutes,
      mood_rating,
      session_context_snapshot,
      workout:workouts(name, focus)
    `)
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(50) as unknown as {
      data: ProgressLogRow[] | null
      error: { message?: string } | null
    }

  if (logsError) throw new Error(logsError.message ?? 'Could not load training history')

  const sessionLogs = logs ?? []
  const logIds = sessionLogs.map(log => log.id)
  if (logIds.length === 0) return { sessionLogs, exerciseLogs: [] }

  const { data, error } = await supabase
    .from('exercise_logs')
    .select(`
      progress_log_id,
      exercise_id,
      sets_completed,
      weights_kg,
      reps_completed,
      rpe_values,
      notes,
      exercise:exercises(name, name_es, muscle_groups, muscle_groups_es, is_compound)
    `)
    .in('progress_log_id', logIds) as unknown as {
      data: ExerciseLogRow[] | null
      error: { message?: string } | null
    }

  if (error) throw new Error(error.message ?? 'Could not load exercise history')

  return {
    sessionLogs,
    exerciseLogs: data ?? [],
  }
}

function buildHighlights(
  rows: ExerciseLogRow[],
  logs: ProgressLogRow[],
  timeZone: string,
  language: ExerciseLanguage,
  fallbackExerciseName: string,
): HistoryHighlight[] {
  const logById = new Map(logs.map(log => [log.id, log]))
  const records = new Map<string, HistoryHighlight & { bestCompletedAt: string }>()

  for (const row of rows) {
    if (!row.exercise_id) continue
    const log = logById.get(row.progress_log_id)
    if (!log) continue
    const exercise = resolveHistoricalExercisePresentation({
      exerciseId: row.exercise_id,
      sessionContextSnapshot: log.session_context_snapshot,
      liveExercise: getExercise(row),
      language,
      fallbackExerciseName,
    })

    const performance = summarizeExercisePerformance(row.weights_kg, row.reps_completed, row.rpe_values)
    const bestSet = performance.bestSet
    const maxReps = performance.sets.reduce((max, set) => Math.max(max, set.reps), 0)
    if (!bestSet && maxReps <= 0) continue

    const current = records.get(row.exercise_id)
    const maxWeightKg = bestSet?.weightKg ?? 0
    const repsAtMaxWeight = bestSet?.reps ?? 0
    const isBetter = !current ||
      maxWeightKg > current.maxWeightKg ||
      (maxWeightKg === current.maxWeightKg && repsAtMaxWeight > current.repsAtMaxWeight) ||
      (maxWeightKg === current.maxWeightKg && repsAtMaxWeight === current.repsAtMaxWeight && log.completed_at > current.bestCompletedAt)

    if (isBetter) {
      records.set(row.exercise_id, {
        exerciseId: row.exercise_id,
        exerciseName: exercise.name,
        muscleGroups: exercise.muscleGroups,
        bestDate: getLocalDateString(new Date(log.completed_at), timeZone),
        bestCompletedAt: log.completed_at,
        maxWeightKg,
        repsAtMaxWeight,
        maxReps,
      })
    } else if (current && maxReps > current.maxReps) {
      current.maxReps = maxReps
    }
  }

  return Array.from(records.values())
    .sort((a, b) => b.bestCompletedAt.localeCompare(a.bestCompletedAt))
}

export default async function HistoryPage() {
  const { supabase, user, profile } = await requireAppUserContext()
  const language = exerciseLanguage(profile.language)
  const t = createTranslator(language)
  const timeZone = resolveUserTimeZone(profile.timezone)
  const todayStr = getLocalDateString(new Date(), timeZone)
  const { sessionLogs, exerciseLogs } = await loadHistoryPayload(supabase, user.id)
  const sessionLogById = new Map(sessionLogs.map(log => [log.id, log]))

  const sessions: HistorySessionInput[] = sessionLogs.map(log => {
    const presentation = toCompletedSessionPresentation(log, t('Entrenamiento'))
    return {
      id: presentation.id,
      workoutId: presentation.workoutId,
      date: getLocalDateString(new Date(log.completed_at), timeZone),
      completedAt: presentation.completedAt,
      workoutName: getWorkoutDisplayName(presentation.workoutName, presentation.focus),
      focus: presentation.focus,
      durationMinutes: presentation.durationMinutes,
    }
  })
  const exercises: HistoryExerciseInput[] = exerciseLogs.map(row => {
    const exercise = resolveHistoricalExercisePresentation({
      exerciseId: row.exercise_id,
      sessionContextSnapshot: sessionLogById.get(row.progress_log_id)?.session_context_snapshot ?? null,
      liveExercise: getExercise(row),
      language,
      fallbackExerciseName: t('Ejercicio'),
    })
    return {
      progressLogId: row.progress_log_id,
      exerciseId: row.exercise_id,
      exerciseName: exercise.name,
      weightsKg: row.weights_kg,
      repsCompleted: row.reps_completed,
      rpeValues: row.rpe_values,
      setsCompleted: row.sets_completed,
      notes: row.notes,
    }
  })
  const evidence = buildHistoryEvidence({ todayStr, sessions, exercises })
  const highlights = buildHighlights(
    exerciseLogs,
    sessionLogs,
    timeZone,
    language,
    t('Ejercicio'),
  )
  const totalVolume = evidence.rows.reduce((sum, row) => sum + row.volumeKg, 0)

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageTopBar
        title={t('Historial')}
        subtitle={t('Últimas sesiones completadas')}
        backHref="/dashboard"
        backLabel="Dashboard"
        icon={<History className="h-5 w-5" />}
        right={(
          <PendingLink href="/calendario" aria-label={t('Calendario')} className="flex h-11 w-11 items-center justify-center rounded-xl text-violet-300 transition-colors hover:bg-violet-500/10" showSpinner={false}>
            <CalendarRange className="h-5 w-5" aria-hidden="true" />
          </PendingLink>
        )}
      />

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <EvidenceHero
          eyebrow={t('Registro cronológico')}
          title={evidence.rows.length > 0 ? `${evidence.rows.length} ${t('sesiones')} ${t('completadas')}` : t('Sin sesiones todavía')}
          description={evidence.rows.length > 0
            ? t('Cada sesión conserva su carga, duración y señales comparables.')
            : t('Cuando completes tu primer entrenamiento aparecerá aquí.')}
        >
          <MetricStrip
            items={[
              { label: t('Sesiones'), value: evidence.rows.length },
              { label: t('Volumen'), value: `${new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-ES', { maximumFractionDigits: 0 }).format(totalVolume)} kg` },
              { label: t('Records personales'), value: highlights.length },
            ]}
          />
        </EvidenceHero>

        {evidence.rows.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-border bg-muted/20 p-8 text-center">
            <Trophy className="mx-auto h-7 w-7 text-violet-300" aria-hidden="true" />
            <p className="mt-4 text-sm text-muted-foreground">{t('Completa una sesión desde tu plan para iniciar el registro.')}</p>
            <PendingLink href="/dashboard" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-600">
              {t('Ir al dashboard')}
            </PendingLink>
          </section>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <HistorySessionList rows={evidence.rows} todayStr={todayStr} />
            <HistoryHighlights records={highlights} />
          </div>
        )}
      </main>
    </div>
  )
}
