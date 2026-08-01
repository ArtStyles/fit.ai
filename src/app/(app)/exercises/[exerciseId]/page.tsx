import { notFound } from 'next/navigation'
import { ArrowDown, Dumbbell, Info, PlayCircle, Target, Trophy } from 'lucide-react'
import { DisclosureSection } from '@/components/evidence/DisclosureSection'
import { EvidenceInsight } from '@/components/evidence/EvidenceInsight'
import { MetricStrip } from '@/components/evidence/MetricStrip'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import { ExerciseProgressChart } from '@/components/exercises/ExerciseProgressChart'
import { buildExerciseDetailView } from '@/components/exercises/exerciseDetailViewModel'
import { SessionSummaryRow } from '@/components/evidence/SessionSummaryRow'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireAppUserContext } from '@/lib/auth/server'
import { exerciseLanguage, localizeExercise } from '@/lib/exercises/localization'
import { createTranslator, dateLocale } from '@/lib/i18n'
import { summarizeExercisePerformance } from '@/lib/training-evidence/performance'
import { getWorkoutDisplayName } from '@/lib/workouts/display'
import { getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'
import type { Database } from '@/types/database'

export const metadata = { title: 'Ejercicio · Vekira' }

type ExerciseRow = {
  id: string
  name: string
  name_es?: string | null
  description: string | null
  description_es?: string | null
  muscle_groups: string[] | null
  muscle_groups_es?: string[] | null
  equipment: string[] | null
  equipment_es?: string[] | null
  difficulty: string | null
  exercise_type: string | null
  is_compound: boolean | null
  instructions: string | null
  instructions_es?: string | null
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
  return Array.isArray(row.progress_log) ? row.progress_log[0] ?? null : row.progress_log
}

function sortExerciseLogs(rows: ExerciseLogRow[]): ExerciseLogRow[] {
  return rows
    .filter(row => getProgressLog(row))
    .sort((a, b) => getProgressLog(b)!.completed_at.localeCompare(getProgressLog(a)!.completed_at))
}

function indexWorkouts(rows: WorkoutRow[]): Record<string, WorkoutRow> {
  return rows.reduce<Record<string, WorkoutRow>>((result, workout) => {
    result[workout.id] = workout
    return result
  }, {})
}

async function loadExerciseDetailPayloadFallback(
  supabase: AppSupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<ExerciseDetailPayloadResult> {
  const { data: exercise, error: exerciseError } = await supabase
    .from('exercises')
    .select('id, name, name_es, description, description_es, muscle_groups, muscle_groups_es, equipment, equipment_es, difficulty, exercise_type, is_compound, instructions, instructions_es, video_url, image_url')
    .eq('id', exerciseId)
    .eq('is_public', true)
    .maybeSingle() as unknown as { data: ExerciseRow | null; error: { message?: string } | null }

  if (exerciseError) throw new Error(exerciseError.message ?? 'Could not load exercise')
  if (!exercise) return { exercise: null, logs: [], workoutsById: {} }

  const { data: rawLogs, error: logsError } = await supabase
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
    .eq('progress_logs.user_id', userId) as unknown as {
      data: ExerciseLogRow[] | null
      error: { message?: string } | null
    }

  if (logsError) throw new Error(logsError.message ?? 'Could not load exercise appearances')

  const logs = sortExerciseLogs(rawLogs ?? [])
  const workoutIds = Array.from(new Set(logs.flatMap(row => getProgressLog(row)?.workout_id ?? [])))
  let workoutsById: Record<string, WorkoutRow> = {}

  if (workoutIds.length > 0) {
    const { data: workouts, error: workoutsError } = await supabase
      .from('workouts')
      .select('id, name, focus')
      .in('id', workoutIds)
      .eq('user_id', userId) as unknown as {
        data: WorkoutRow[] | null
        error: { message?: string } | null
      }

    if (workoutsError) throw new Error(workoutsError.message ?? 'Could not load related workouts')
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
    // The direct read below remains the source of truth when the optional RPC is unavailable.
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

function formatNumber(value: number, language: 'es' | 'en'): string {
  return new Intl.NumberFormat(dateLocale(language), { maximumFractionDigits: 1 }).format(value)
}

function trendCopy(trend: 'up' | 'same' | 'down' | 'baseline', language: 'es' | 'en'): string {
  if (trend === 'up') return language === 'en' ? 'The latest valid load is above the previous appearance.' : 'La última carga válida está por encima de la aparición anterior.'
  if (trend === 'down') return language === 'en' ? 'The latest valid load is below the previous appearance.' : 'La última carga válida está por debajo de la aparición anterior.'
  if (trend === 'same') return language === 'en' ? 'The latest valid load is stable versus the previous appearance.' : 'La última carga válida se mantiene frente a la aparición anterior.'
  return language === 'en' ? 'More valid load data is needed to establish a trend.' : 'Se necesitan más cargas válidas para establecer una tendencia.'
}

export default async function ExerciseDetailPage({ params }: PageProps) {
  const { supabase, user, profile } = await requireAppUserContext()
  const language = exerciseLanguage(profile.language)
  const t = createTranslator(language)
  const timeZone = resolveUserTimeZone(profile.timezone)
  const todayStr = getLocalDateString(new Date(), timeZone)
  const payload = await loadExerciseDetailPayload(supabase, user.id, params.exerciseId)
  const exercise = payload.exercise ? localizeExercise(payload.exercise, language) : null
  if (!exercise) notFound()

  const view = buildExerciseDetailView(payload.logs.flatMap(row => {
    const progressLog = getProgressLog(row)
    return progressLog ? [{
      logId: progressLog.id,
      completedAt: progressLog.completed_at,
      weightsKg: row.weights_kg,
      repsCompleted: row.reps_completed,
      rpeValues: row.rpe_values,
    }] : []
  }), language, timeZone)
  const pointByLogId = new Map(view.points.map(point => [point.logId, point]))
  const description = cleanText(exercise.description)
  const instructions = cleanText(exercise.instructions)
  const context = [exercise.exercise_type, exercise.difficulty, exercise.is_compound ? t('compuesto') : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageTopBar
        title={exercise.name}
        subtitle={t('Ficha de ejercicio')}
        backHref="/history"
        backLabel={t('Historial')}
        icon={<Dumbbell className="h-5 w-5" />}
      />

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        <section className="grid overflow-hidden rounded-3xl border border-violet-500/20 bg-violet-500/[0.06] md:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="p-5 sm:p-7">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-300">{t('Pasaporte del movimiento')}</p>
            <h2 className="mt-2 font-display text-4xl font-bold leading-tight text-foreground">{exercise.name}</h2>
            {context ? <p className="mt-2 text-sm capitalize text-muted-foreground">{context}</p> : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {[...(exercise.muscle_groups ?? []), ...(exercise.equipment ?? [])].slice(0, 7).map((item, index) => (
                <span key={`${item}-${index}`} className="rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs capitalize text-muted-foreground">{item}</span>
              ))}
            </div>
            <a href="#tecnica" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-400/25 bg-violet-500/10 px-4 text-sm font-semibold text-violet-100 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
              {language === 'en' ? 'Review technique' : 'Revisar técnica'}
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <ExerciseImage src={exercise.image_url} alt={exercise.name} variant="hero" zoomable className="h-full min-h-56 w-full border-t border-border/50 md:border-l md:border-t-0" />
        </section>

        <MetricStrip
          items={[
            { label: t('Sesiones'), value: view.sessions },
            { label: t('Mejor peso'), value: view.best && view.best.maxWeightKg > 0 ? `${formatNumber(view.best.maxWeightKg, language)} kg` : '—', detail: view.best?.repsAtMaxWeight ? `${view.best.repsAtMaxWeight} reps` : undefined },
            { label: t('Último estímulo'), value: view.latest ? `${formatNumber(view.latest.volumeKg, language)} kg` : '—', detail: language === 'en' ? 'latest volume' : 'volumen más reciente' },
            { label: 'RPE', value: view.latestAverageRpe ?? '—', detail: language === 'en' ? 'latest appearance' : 'última aparición' },
          ]}
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <ExerciseProgressChart points={view.points} todayStr={todayStr} locale={language} />
          <aside className="space-y-4 lg:sticky lg:top-24">
            <EvidenceInsight title={t('Último estímulo')} tone={view.trend === 'up' ? 'success' : view.trend === 'down' ? 'warning' : 'neutral'}>
              {trendCopy(view.trend, language)}
            </EvidenceInsight>
            {view.latest ? (
              <section className="rounded-3xl border border-border/60 bg-muted/[0.05] p-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{language === 'en' ? 'Latest appearance' : 'Última aparición'}</p>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-3 border-t border-border/50 pt-3"><dt className="text-muted-foreground">{t('Peso')}</dt><dd className="font-semibold text-foreground">{formatNumber(view.latest.maxWeightKg, language)} kg</dd></div>
                  <div className="flex justify-between gap-3 border-t border-border/50 pt-3"><dt className="text-muted-foreground">{t('Reps')}</dt><dd className="font-semibold text-foreground">{view.latest.repsAtMaxWeight}</dd></div>
                  <div className="flex justify-between gap-3 border-t border-border/50 pt-3"><dt className="text-muted-foreground">{t('Volumen')}</dt><dd className="font-semibold text-foreground">{formatNumber(view.latest.volumeKg, language)} kg</dd></div>
                </dl>
              </section>
            ) : null}
            {view.best && view.best.maxWeightKg > 0 ? (
              <section className="rounded-3xl border border-amber-500/15 bg-amber-500/[0.04] p-5">
                <div className="flex items-center gap-2 text-amber-200"><Trophy className="h-4 w-4" aria-hidden="true" /><p className="text-sm font-semibold">{t('Mejor marca')}</p></div>
                <p className="mt-3 font-display text-3xl font-bold text-foreground">{formatNumber(view.best.maxWeightKg, language)} kg</p>
                <p className="mt-1 text-xs text-muted-foreground">{view.best.repsAtMaxWeight} reps · {view.best.dateLabel}</p>
              </section>
            ) : null}
          </aside>
        </div>

        <section id="tecnica" className="scroll-mt-24 rounded-3xl border border-border/60 bg-muted/[0.035] p-5 sm:p-7" aria-labelledby="technique-title">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{language === 'en' ? 'Movement context' : 'Contexto del movimiento'}</p>
              <h2 id="technique-title" className="mt-1 font-display text-2xl font-bold text-foreground">{language === 'en' ? 'Technique and setup' : 'Técnica y preparación'}</h2>
            </div>
            <Target className="h-5 w-5 text-violet-300" aria-hidden="true" />
          </div>
          {description ? <p className="mt-5 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
          {(exercise.equipment?.length ?? 0) > 0 ? (
            <div className="mt-5 border-t border-border/50 pt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('Equipo')}</p>
              <p className="mt-2 text-sm capitalize text-foreground">{exercise.equipment!.join(' · ')}</p>
            </div>
          ) : null}
          {instructions || exercise.video_url ? (
            <DisclosureSection summary={t('Mostrar instrucciones')} className="mt-5">
              {instructions ? <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{instructions}</p> : null}
              {exercise.video_url ? (
                <a href={exercise.video_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 text-sm font-semibold text-violet-100 hover:bg-violet-500/20">
                  <PlayCircle className="h-4 w-4" aria-hidden="true" />
                  {language === 'en' ? 'Open technique video' : 'Abrir video de técnica'}
                </a>
              ) : null}
            </DisclosureSection>
          ) : null}
        </section>

        <section aria-labelledby="exercise-history-title">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{language === 'en' ? 'Chronology' : 'Cronología'}</p>
          <h2 id="exercise-history-title" className="mt-1 font-display text-2xl font-bold text-foreground">{t('Historial del ejercicio')}</h2>

          {payload.logs.length === 0 ? (
            <div className="mt-5 rounded-3xl border border-dashed border-border bg-muted/20 p-7 text-center">
              <Info className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-foreground">{t('Sin registros todavía')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('Cuando completes este ejercicio, aquí verás su progreso.')}</p>
            </div>
          ) : (
            <div className="mt-4">
              {payload.logs.map(row => {
                const progressLog = getProgressLog(row)!
                const point = pointByLogId.get(progressLog.id)
                const workout = progressLog.workout_id ? payload.workoutsById[progressLog.workout_id] : null
                const workoutName = workout ? getWorkoutDisplayName(workout.name, workout.focus) : t('Entrenamiento')
                const performance = summarizeExercisePerformance(row.weights_kg, row.reps_completed, row.rpe_values)

                return (
                  <SessionSummaryRow
                    key={row.id}
                    href={`/history/${progressLog.id}`}
                    dateLabel={point?.dateLabel ?? getLocalDateString(new Date(progressLog.completed_at), timeZone)}
                    title={workoutName}
                    context={row.notes}
                    signal={performance.averageRpe === null ? null : { label: `RPE ${performance.averageRpe}`, tone: performance.averageRpe >= 9 ? 'warning' : 'neutral' }}
                    metrics={[
                      { label: t('Peso'), value: point ? `${formatNumber(point.maxWeightKg, language)} kg` : '—' },
                      { label: t('Series'), value: String(row.sets_completed ?? performance.completedSets) },
                      { label: t('Volumen'), value: point ? `${formatNumber(point.volumeKg, language)} kg` : '—' },
                    ]}
                  />
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
