import { notFound } from 'next/navigation'
import { Dumbbell, Info, Sparkles, Trophy } from 'lucide-react'
import { EvidenceHero } from '@/components/evidence/EvidenceHero'
import { EvidenceInsight } from '@/components/evidence/EvidenceInsight'
import { MetricStrip } from '@/components/evidence/MetricStrip'
import { SessionExerciseDisclosure } from '@/components/history/SessionExerciseDisclosure'
import {
  buildSessionDebrief,
  type PreviousExercisePerformance,
  type PriorBest,
  type SessionExerciseInput,
} from '@/components/history/sessionDebrief'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { ShareSessionButton } from '@/components/social/ShareSessionButton'
import { requireAppUserContext } from '@/lib/auth/server'
import { exerciseLanguage, localizeExercise } from '@/lib/exercises/localization'
import { createTranslator, dateLocale } from '@/lib/i18n'
import { summarizeExercisePerformance } from '@/lib/training-evidence/performance'
import { getWorkoutDisplayName } from '@/lib/workouts/display'

export const metadata = { title: 'Detalle de sesión · Vekira' }

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
  name_es: string | null
  muscle_groups: string[] | null
  muscle_groups_es: string[] | null
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
  reps_completed: number[] | null
  rpe_values: (number | null)[] | null
  progress_logs: { completed_at: string } | { completed_at: string }[] | null
}

interface PageProps {
  params: { logId: string }
}

function getWorkout(row: ProgressLogRow): WorkoutSummary | null {
  return Array.isArray(row.workout) ? row.workout[0] ?? null : row.workout
}

function getExercise(row: ExerciseLogRow): ExerciseSummary | null {
  return Array.isArray(row.exercise) ? row.exercise[0] ?? null : row.exercise
}

function previousCompletedAt(row: PreviousExerciseLogRow): string {
  return Array.isArray(row.progress_logs)
    ? row.progress_logs[0]?.completed_at ?? ''
    : row.progress_logs?.completed_at ?? ''
}

function formatDateTime(value: string, language: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(dateLocale(language), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`
}

function formatVolume(value: number, language: 'es' | 'en'): string {
  return `${new Intl.NumberFormat(dateLocale(language), { maximumFractionDigits: 0 }).format(value)} kg`
}

export default async function HistoryDetailPage({ params }: PageProps) {
  const { supabase, user, profile } = await requireAppUserContext()
  const language = exerciseLanguage(profile.language)
  const t = createTranslator(language)

  const { data: log, error: logError } = await supabase
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
    .maybeSingle() as unknown as { data: ProgressLogRow | null; error: { message?: string } | null }

  if (logError) throw new Error(logError.message ?? 'Could not load completed session')
  if (!log) notFound()

  const { data: exerciseLogRows, error: exerciseLogError } = await supabase
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
      exercise:exercises(name, name_es, muscle_groups, muscle_groups_es, is_compound)
    `)
    .eq('progress_log_id', log.id) as unknown as { data: ExerciseLogRow[] | null; error: { message?: string } | null }

  if (exerciseLogError) throw new Error(exerciseLogError.message ?? 'Could not load completed exercises')

  const exerciseLogs = (exerciseLogRows ?? []).map(row => ({
    ...row,
    exercise: Array.isArray(row.exercise)
      ? row.exercise.map(exercise => localizeExercise(exercise, language))
      : row.exercise
        ? localizeExercise(row.exercise, language)
        : null,
  }))
  const exerciseIds = Array.from(new Set(exerciseLogs.map(row => row.exercise_id)))
  let previousLogs: PreviousExerciseLogRow[] = []

  if (exerciseIds.length > 0) {
    const { data, error } = await supabase
      .from('exercise_logs')
      .select('exercise_id, weights_kg, reps_completed, rpe_values, progress_logs!inner(user_id, completed_at)')
      .in('exercise_id', exerciseIds)
      .eq('progress_logs.user_id', user.id)
      .lt('progress_logs.completed_at', log.completed_at)
      .order('completed_at', { referencedTable: 'progress_logs', ascending: false }) as unknown as {
        data: PreviousExerciseLogRow[] | null
        error: { message?: string } | null
      }

    if (error) throw new Error(error.message ?? 'Could not load previous exercise evidence')
    previousLogs = [...(data ?? [])].sort((a, b) => previousCompletedAt(b).localeCompare(previousCompletedAt(a)))
  }

  const previousByExercise = new Map<string, PreviousExercisePerformance>()
  const priorBestByExercise = new Map<string, PriorBest>()
  for (const previous of previousLogs) {
    if (!previousByExercise.has(previous.exercise_id)) {
      previousByExercise.set(previous.exercise_id, {
        weightsKg: previous.weights_kg,
        repsCompleted: previous.reps_completed,
        rpeValues: previous.rpe_values,
      })
    }
    const bestSet = summarizeExercisePerformance(previous.weights_kg, previous.reps_completed, previous.rpe_values).bestSet
    const currentBest = priorBestByExercise.get(previous.exercise_id)
    if (bestSet && (!currentBest || bestSet.weightKg > currentBest.weightKg || (bestSet.weightKg === currentBest.weightKg && bestSet.reps > currentBest.reps))) {
      priorBestByExercise.set(previous.exercise_id, { weightKg: bestSet.weightKg, reps: bestSet.reps })
    }
  }

  const exercises: SessionExerciseInput[] = exerciseLogs.map(row => {
    const exercise = getExercise(row)
    return {
      id: row.id,
      exerciseId: row.exercise_id,
      exerciseName: exercise?.name ?? t('Ejercicio'),
      muscleGroups: exercise?.muscle_groups ?? [],
      setsCompleted: row.sets_completed,
      weightsKg: row.weights_kg,
      repsCompleted: row.reps_completed,
      rpeValues: row.rpe_values,
      notes: row.notes,
    }
  })
  const debrief = buildSessionDebrief({
    durationMinutes: Number(log.duration_minutes) || 0,
    exercises,
    previousByExercise,
    priorBestByExercise,
  })
  const workout = getWorkout(log)
  const workoutName = workout ? getWorkoutDisplayName(workout.name, workout.focus) : t('Entrenamiento')

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageTopBar
        title={workoutName}
        subtitle={formatDateTime(log.completed_at, language)}
        backHref="/history"
        backLabel={t('Historial')}
        icon={<Dumbbell className="h-5 w-5" />}
      />

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <EvidenceHero
          eyebrow={t('Debrief de entrenamiento')}
          title={workoutName}
          description={[formatDateTime(log.completed_at, language), workout?.focus].filter(Boolean).join(' · ')}
        >
          <MetricStrip
            items={[
              { label: t('Duración'), value: formatDuration(debrief.durationMinutes) },
              { label: t('Series completadas'), value: debrief.totalSets },
              { label: t('Volumen'), value: formatVolume(debrief.totalVolumeKg, language) },
            ]}
          />
        </EvidenceHero>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <section aria-labelledby="session-sequence-title">
            <h2 id="session-sequence-title" className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{t('Secuencia de la sesión')}</h2>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">{debrief.exercises.length} {t('Ejercicios')}</p>

            {debrief.exercises.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-border bg-muted/20 p-7 text-center">
                <Info className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-foreground">{t('Sin detalle de ejercicios')}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t('Esta sesión no tiene logs por ejercicio.')}</p>
              </div>
            ) : (
              <div className="mt-4">
                {debrief.exercises.map((exercise, index) => (
                  <SessionExerciseDisclosure key={exercise.id} index={index} exercise={exercise} />
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-4 lg:sticky lg:top-24">
            {(log.mood_rating || log.energy_rating || debrief.averageRpe !== null) ? (
              <section className="rounded-3xl border border-border/60 bg-muted/[0.05] p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{t('Resultado')}</p>
                <dl className="mt-4 space-y-3 text-sm">
                  {log.mood_rating ? <div className="flex justify-between gap-3 border-t border-border/50 pt-3"><dt className="text-muted-foreground">{t('Ánimo')}</dt><dd className="font-semibold text-foreground">{log.mood_rating}/5</dd></div> : null}
                  {log.energy_rating ? <div className="flex justify-between gap-3 border-t border-border/50 pt-3"><dt className="text-muted-foreground">{t('Energía')}</dt><dd className="font-semibold text-foreground">{log.energy_rating}/5</dd></div> : null}
                  {debrief.averageRpe !== null ? <div className="flex justify-between gap-3 border-t border-border/50 pt-3"><dt className="text-muted-foreground">RPE</dt><dd className="font-semibold text-foreground">{debrief.averageRpe}</dd></div> : null}
                </dl>
              </section>
            ) : null}

            {debrief.recordCount > 0 ? (
              <EvidenceInsight title={`${debrief.recordCount} PR${debrief.recordCount === 1 ? '' : 's'}`} tone="success">
                {t('Nuevas marcas frente al historial anterior.')}
              </EvidenceInsight>
            ) : null}
            {debrief.skippedCount > 0 ? (
              <EvidenceInsight title={`${debrief.skippedCount} ${t('Saltado').toLowerCase()}${debrief.skippedCount === 1 ? '' : 's'}`} tone="warning">
                {t('Revisa las notas dentro de la secuencia.')}
              </EvidenceInsight>
            ) : null}
            {log.notes ? <EvidenceInsight title={t('Notas')} tone="neutral">{log.notes}</EvidenceInsight> : null}

            <section className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.05] p-5">
              <div className="flex items-center gap-2 text-violet-200">
                {debrief.recordCount > 0 ? <Trophy className="h-4 w-4" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                <p className="text-sm font-semibold">{t('Compartir resultado')}</p>
              </div>
              <div className="mt-4"><ShareSessionButton progressLogId={params.logId} /></div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
