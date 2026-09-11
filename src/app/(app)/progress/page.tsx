import { BarChart3 } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { ProgressHub } from '@/components/progress/ProgressHub'
import { readFreeTrainingDetail, type FreeTrainingEvidenceSource } from '@/lib/session/freeTrainingEvidence'
import {
  summarizeProgressSetEvidence,
  normalizeProgressDayVolumes,
  type ProgressExercisePoint,
  type ProgressMeasurement,
  type ProgressRecord,
  type ProgressSession,
  type ProgressSetEvidenceSummary,
} from '@/components/progress/progressViewModel'
import { requireAppUserContext } from '@/lib/auth/server'
import {
  aggregateLogsToDays,
  type DayAggregate,
  type RawExerciseLog,
  type RawProgressLog,
} from '@/lib/calendar/aggregate'
import { resolveHistoricalExercisePresentation } from '@/lib/exercises/historyPresentation'
import { exerciseLanguage, type ExerciseLanguage } from '@/lib/exercises/localization'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'
import { addDays, getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'
import { buildHistoricalMuscleActivity } from '@/lib/muscles/history'
import type { MuscleActivityInput } from '@/lib/muscles/activity'
import { loadCompleteProgressHistory } from '@/lib/progress/historyPagination'

export const metadata = { title: 'Progreso · Vekira' }

type AppSupabaseClient = Awaited<ReturnType<typeof requireAppUserContext>>['supabase']

type ExerciseSummary = {
  name: string
  name_es?: string | null
  muscle_groups: string[] | null
  muscle_groups_es?: string[] | null
  is_compound: boolean | null
}

type ProgressLogRow = RawProgressLog & FreeTrainingEvidenceSource & {
  workout_id: string | null
  session_context_snapshot: unknown
}

type ExerciseLogRow = RawExerciseLog & {
  id: string
  sets_completed: number | null
  exercise_id: string | null
  exercise: ExerciseSummary | ExerciseSummary[] | null
}

type MeasurementRow = {
  id: string
  recorded_at: string
  weight_kg: number | null
  body_fat_percentage: number | null
  waist_cm: number | null
}

function getExercise(row: ExerciseLogRow): ExerciseSummary | null {
  if (Array.isArray(row.exercise)) return row.exercise[0] ?? null
  return row.exercise
}

function volumeForRows(logId: string, rows: ExerciseLogRow[]): number {
  return rows
    .filter(row => row.progress_log_id === logId)
    .reduce((total, row) => total + (summarizeProgressSetEvidence({
      setsCompleted: row.sets_completed,
      weightsKg: row.weights_kg,
      repsCompleted: row.reps_completed,
    })?.volumeKg ?? 0), 0)
}

type SessionExercisePerformance = ProgressSetEvidenceSummary & {
  exerciseId: string
  exerciseName: string
  muscleGroups: string[]
  sessionId: string
  completedAt: string
  date: string
}

function buildSessionExercisePerformances(
  rows: ExerciseLogRow[],
  logs: ProgressLogRow[],
  timeZone: string,
  language: ExerciseLanguage,
  fallbackExerciseName: string,
): SessionExercisePerformance[] {
  const logById = new Map(logs.map(log => [log.id, log]))
  const grouped = new Map<string, SessionExercisePerformance>()

  for (const row of rows) {
    if (!row.exercise_id) continue
    const log = logById.get(row.progress_log_id)
    const evidence = summarizeProgressSetEvidence({
      setsCompleted: row.sets_completed,
      weightsKg: row.weights_kg,
      repsCompleted: row.reps_completed,
    })
    if (!log || !evidence) continue
    const exercise = resolveHistoricalExercisePresentation({
      exerciseId: row.exercise_id,
      sessionContextSnapshot: log.session_context_snapshot,
      liveExercise: getExercise(row),
      language,
      fallbackExerciseName,
    })
    const key = `${row.exercise_id}:${log.id}`
    const current = grouped.get(key)
    if (!current) {
      grouped.set(key, {
        ...evidence,
        exerciseId: row.exercise_id,
        exerciseName: exercise.name,
        muscleGroups: exercise.muscleGroups,
        sessionId: log.id,
        completedAt: log.completed_at,
        date: getLocalDateString(new Date(log.completed_at), timeZone),
      })
      continue
    }
    const bestSet = evidence.bestSet.weightKg > current.bestSet.weightKg || (
      evidence.bestSet.weightKg === current.bestSet.weightKg && evidence.bestSet.reps > current.bestSet.reps
    ) ? evidence.bestSet : current.bestSet
    grouped.set(key, {
      ...current,
      bestSet,
      maxReps: Math.max(current.maxReps, evidence.maxReps),
      volumeKg: current.volumeKg + evidence.volumeKg,
    })
  }

  return Array.from(grouped.values())
}

function buildProgressRecords(
  rows: ExerciseLogRow[],
  logs: ProgressLogRow[],
  timeZone: string,
  language: ExerciseLanguage,
  fallbackExerciseName: string,
): ProgressRecord[] {
  const records = new Map<string, ProgressRecord>()

  for (const performance of buildSessionExercisePerformances(rows, logs, timeZone, language, fallbackExerciseName)) {
    const maxWeightKg = performance.bestSet.weightKg
    const repsAtMaxWeight = performance.bestSet.reps
    const current = records.get(performance.exerciseId)
    const isBetter =
      !current ||
      maxWeightKg > current.maxWeightKg ||
      (maxWeightKg === current.maxWeightKg && repsAtMaxWeight > current.repsAtMaxWeight) ||
      (
        maxWeightKg === current.maxWeightKg &&
        repsAtMaxWeight === current.repsAtMaxWeight &&
        new Date(performance.completedAt).getTime() > new Date(current.bestCompletedAt).getTime()
      )

    records.set(performance.exerciseId, {
      exerciseId: performance.exerciseId,
      exerciseName: isBetter ? performance.exerciseName : current!.exerciseName,
      muscleGroups: isBetter ? performance.muscleGroups : current!.muscleGroups,
      bestCompletedAt: isBetter ? performance.completedAt : current!.bestCompletedAt,
      bestDate: isBetter ? performance.date : current!.bestDate,
      maxWeightKg: isBetter ? maxWeightKg : current!.maxWeightKg,
      repsAtMaxWeight: isBetter ? repsAtMaxWeight : current!.repsAtMaxWeight,
      maxReps: Math.max(current?.maxReps ?? 0, performance.maxReps),
      totalVolumeKg: Math.round((current?.totalVolumeKg ?? 0) + performance.volumeKg),
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
}

function buildProgressExercisePoints(
  rows: ExerciseLogRow[],
  logs: ProgressLogRow[],
  timeZone: string,
  language: ExerciseLanguage,
  fallbackExerciseName: string,
): ProgressExercisePoint[] {
  return buildSessionExercisePerformances(rows, logs, timeZone, language, fallbackExerciseName).map(performance => ({
    exerciseId: performance.exerciseId,
    exerciseName: performance.exerciseName,
    date: performance.date,
    completedAt: performance.completedAt,
    sessionId: performance.sessionId,
    maxWeightKg: performance.bestSet.weightKg,
    repsAtMaxWeight: performance.bestSet.reps,
    volumeKg: performance.volumeKg,
  }))
}

async function loadProgressData(
  supabase: AppSupabaseClient,
  userId: string,
  language: ExerciseLanguage,
  timeZone: string,
  fallbackExerciseName: string,
): Promise<{
  sessions: ProgressSession[]
  days: DayAggregate[]
  records: ProgressRecord[]
  measurements: ProgressMeasurement[]
  exercisePoints: ProgressExercisePoint[]
  muscleActivity: MuscleActivityInput[]
}> {
  const from = addDays(new Date(), -365).toISOString()

  const [history, measurementsResult] = await Promise.all([
    loadCompleteProgressHistory<ProgressLogRow, ExerciseLogRow>({
      loadLogPage: (pageFrom, pageTo) => supabase
        .from('progress_logs')
        .select(`id, workout_id, completed_at, duration_minutes, session_context_snapshot${process.env.NEXT_PUBLIC_LOCAL_APP === 'true' ? ', mobile_session_kind, mobile_free_training' : ''}`)
        .eq('user_id', userId)
        .gte('completed_at', from)
        .order('completed_at', { ascending: false })
        .order('id', { ascending: true })
        .range(pageFrom, pageTo) as unknown as Promise<{ data: ProgressLogRow[] | null; error: { message?: string } | null }>,
      loadExercisePage: (logIds, pageFrom, pageTo) => supabase
        .from('exercise_logs')
        .select(`
          id,
          progress_log_id,
          exercise_id,
          weights_kg,
          reps_completed,
          sets_completed,
          exercise:exercises(name, name_es, muscle_groups, muscle_groups_es, is_compound)
        `)
        .in('progress_log_id', logIds)
        .order('progress_log_id', { ascending: true })
        .order('id', { ascending: true })
        .range(pageFrom, pageTo) as unknown as Promise<{ data: ExerciseLogRow[] | null; error: { message?: string } | null }>,
    }),
    supabase
      .from('measurements')
      .select('id, recorded_at, weight_kg, body_fat_percentage, waist_cm')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(100) as unknown as Promise<{ data: MeasurementRow[] | null; error: { message?: string } | null }>,
  ])

  if (measurementsResult.error) throw new Error(measurementsResult.error.message ?? 'Could not load measurements')

  const sessionLogs = history.logs
  const exerciseLogs = history.exerciseLogs

  const sessions = sessionLogs.map(log => ({
    id: log.id,
    completedAt: log.completed_at,
    date: getLocalDateString(new Date(log.completed_at), timeZone),
    durationMinutes: Number(log.duration_minutes) || 0,
    volumeKg: Math.round(volumeForRows(log.id, exerciseLogs)),
    detailLevel: readFreeTrainingDetail(log),
  }))

  return {
    muscleActivity: buildHistoricalMuscleActivity(exerciseLogs, sessionLogs, timeZone, language),
    sessions,
    days: normalizeProgressDayVolumes(aggregateLogsToDays(sessionLogs, exerciseLogs, timeZone), sessions),
    records: buildProgressRecords(
      exerciseLogs,
      sessionLogs,
      timeZone,
      language,
      fallbackExerciseName,
    ),
    measurements: (measurementsResult.data ?? []).map(row => ({
      id: row.id,
      recordedAt: row.recorded_at,
      recordedDate: getLocalDateString(new Date(row.recorded_at), timeZone),
      weightKg: row.weight_kg,
      bodyFatPercentage: row.body_fat_percentage,
      waistCm: row.waist_cm,
    })),
    exercisePoints: buildProgressExercisePoints(
      exerciseLogs,
      sessionLogs,
      timeZone,
      language,
      fallbackExerciseName,
    ),
  }
}

export default async function ProgressPage() {
  const { supabase, user, profile } = await requireAppUserContext()
  const language = normalizeLanguage(profile.language)
  const t = createTranslator(language)
  const timeZone = resolveUserTimeZone(profile.timezone)
  const todayStr = getLocalDateString(new Date(), timeZone)
  const progressData = await loadProgressData(
    supabase,
    user.id,
    exerciseLanguage(profile.language),
    timeZone,
    t('Ejercicio'),
  )

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageTopBar
        title={t('Progreso')}
        backHref="/dashboard"
        backLabel="Dashboard"
        icon={<BarChart3 className="h-5 w-5" />}
      />
      <ProgressHub
        {...progressData}
        todayStr={todayStr}
        locale={language}
      />
    </div>
  )
}
