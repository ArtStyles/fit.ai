import { BarChart3 } from 'lucide-react'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import {
  ProgressHub,
  type ProgressMeasurement,
  type ProgressRecord,
  type ProgressSession,
} from '@/components/progress/ProgressHub'
import type { TrackedExercise } from '@/app/actions/progression'
import { requireAppUserContext } from '@/lib/auth/server'
import {
  aggregateLogsToDays,
  type DayAggregate,
  type RawExerciseLog,
  type RawProgressLog,
} from '@/lib/calendar/aggregate'
import { exerciseLanguage, localizeExercise, type ExerciseLanguage } from '@/lib/exercises/localization'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'
import { addDays, getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'

export const metadata = { title: 'Progreso · Vekira' }

type AppSupabaseClient = Awaited<ReturnType<typeof requireAppUserContext>>['supabase']

type ExerciseSummary = {
  name: string
  name_es?: string | null
  muscle_groups: string[] | null
  muscle_groups_es?: string[] | null
  is_compound: boolean | null
}

type ProgressLogRow = RawProgressLog & {
  workout_id: string | null
}

type ExerciseLogRow = RawExerciseLog & {
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
    .reduce((total, row) => {
      const weights = row.weights_kg ?? []
      const reps = row.reps_completed ?? []
      return total + weights.reduce((sum, weight, index) => {
        return sum + (Number(weight) || 0) * (Number(reps[index]) || 0)
      }, 0)
    }, 0)
}

function buildProgressRecords(
  rows: ExerciseLogRow[],
  logs: ProgressLogRow[],
  timeZone: string,
): ProgressRecord[] {
  const logById = new Map(logs.map(log => [log.id, log]))
  const records = new Map<string, ProgressRecord>()

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
      bestCompletedAt: isBetter ? log.completed_at : current!.bestCompletedAt,
      bestDate: isBetter
        ? getLocalDateString(new Date(log.completed_at), timeZone)
        : current!.bestDate,
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
}

function buildTrackedExercises(rows: ExerciseLogRow[]): TrackedExercise[] {
  const exerciseCountById = new Map<string, number>()
  const exerciseMetaById = new Map<string, { name: string; muscleGroups: string[] }>()

  for (const row of rows) {
    if (!row.exercise_id) continue
    const exercise = getExercise(row)
    if (!exercise) continue
    exerciseCountById.set(row.exercise_id, (exerciseCountById.get(row.exercise_id) ?? 0) + 1)
    if (!exerciseMetaById.has(row.exercise_id)) {
      exerciseMetaById.set(row.exercise_id, {
        name: exercise.name,
        muscleGroups: exercise.muscle_groups ?? [],
      })
    }
  }

  return Array.from(exerciseCountById.entries())
    .map(([id, sessionCount]) => ({ id, sessionCount, ...exerciseMetaById.get(id)! }))
    .sort((a, b) => b.sessionCount - a.sessionCount)
}

async function loadProgressData(
  supabase: AppSupabaseClient,
  userId: string,
  language: ExerciseLanguage,
  timeZone: string,
): Promise<{
  sessions: ProgressSession[]
  days: DayAggregate[]
  records: ProgressRecord[]
  measurements: ProgressMeasurement[]
  trackedExercises: TrackedExercise[]
}> {
  const from = addDays(new Date(), -365).toISOString()

  const [{ data: logs }, { data: measurements }] = await Promise.all([
    supabase
      .from('progress_logs')
      .select('id, workout_id, completed_at, duration_minutes')
      .eq('user_id', userId)
      .not('workout_id', 'is', null)
      .gte('completed_at', from)
      .order('completed_at', { ascending: false })
      .limit(300) as unknown as Promise<{ data: ProgressLogRow[] | null }>,
    supabase
      .from('measurements')
      .select('id, recorded_at, weight_kg, body_fat_percentage, waist_cm')
      .eq('user_id', userId)
      .order('recorded_at', { ascending: false })
      .limit(100) as unknown as Promise<{ data: MeasurementRow[] | null }>,
  ])

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

  return {
    sessions: sessionLogs.map(log => ({
      id: log.id,
      completedAt: log.completed_at,
      date: getLocalDateString(new Date(log.completed_at), timeZone),
      durationMinutes: Number(log.duration_minutes) || 0,
      volumeKg: Math.round(volumeForRows(log.id, exerciseLogs)),
    })),
    days: aggregateLogsToDays(sessionLogs, exerciseLogs, timeZone),
    records: buildProgressRecords(exerciseLogs, sessionLogs, timeZone),
    measurements: (measurements ?? []).map(row => ({
      id: row.id,
      recordedAt: row.recorded_at,
      recordedDate: getLocalDateString(new Date(row.recorded_at), timeZone),
      weightKg: row.weight_kg,
      bodyFatPercentage: row.body_fat_percentage,
      waistCm: row.waist_cm,
    })),
    trackedExercises: buildTrackedExercises(exerciseLogs),
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
  )

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageTopBar
        title={t('Progreso')}
        subtitle={t('Constancia, volumen, marcas y medidas en un solo lugar')}
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
