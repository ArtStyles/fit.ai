import { notFound } from 'next/navigation'
import { ChartNoAxesColumnIncreasing, ChevronDown, Dumbbell, Info, PlayCircle, Target } from 'lucide-react'
import { DisclosureSection } from '@/components/evidence/DisclosureSection'
import { MetricStrip } from '@/components/evidence/MetricStrip'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import { ExerciseMotionPreview } from '@/components/exercises/ExerciseMotionPreview'
import { ExerciseProgressChart } from '@/components/exercises/ExerciseProgressChart'
import { buildExerciseDetailView } from '@/components/exercises/exerciseDetailViewModel'
import { SessionSummaryRow } from '@/components/evidence/SessionSummaryRow'
import { PageTopBar } from '@/components/navigation/PageTopBar'
import { requireAppUserContext } from '@/lib/auth/server'
import { exerciseLanguage, localizeEquipment, localizeExercise, localizeMuscleGroup } from '@/lib/exercises/localization'
import { createTranslator, dateLocale } from '@/lib/i18n'
import { toExerciseHistoryPresentation } from '@/lib/exercises/historyPresentation'
import { parseSessionContextSnapshot } from '@/lib/session/contextSnapshot'
import { summarizeExercisePerformance } from '@/lib/training-evidence/performance'
import { getWorkoutDisplayName } from '@/lib/workouts/display'
import { getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'
import type { Database } from '@/types/database'
import { ExerciseHistoryAnchor } from './ExerciseHistoryAnchor'

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
  motion_preview_url: string | null
}

type EmbeddedProgressLog = {
  id: string
  user_id?: string
  workout_id: string | null
  completed_at: string
  duration_minutes: number | null
  mood_rating: number | null
  session_context_snapshot?: unknown
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
  params: Promise<{ exerciseId: string }>
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
  historical: boolean
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

function preservedExercise(exerciseId: string, logs: ExerciseLogRow[]): ExerciseRow | null {
  for (const row of logs) {
    const snapshot = parseSessionContextSnapshot(getProgressLog(row)?.session_context_snapshot)
    const exercise = snapshot?.exercises.find(item => item.exerciseId === exerciseId)
    if (!exercise) continue
    return {
      id: exerciseId,
      name: exercise.name,
      name_es: exercise.nameEs,
      muscle_groups: exercise.muscleGroups,
      muscle_groups_es: exercise.muscleGroupsEs,
      is_compound: exercise.isCompound,
      description: null,
      equipment: null,
      difficulty: null,
      exercise_type: null,
      instructions: null,
      video_url: null,
      image_url: null,
      motion_preview_url: null,
    }
  }
  return null
}

async function loadExerciseDetailPayloadFallback(
  supabase: AppSupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<ExerciseDetailPayloadResult> {
  const { data: catalogExercise, error: exerciseError } = await supabase
    .from('exercises')
    .select('id, name, name_es, description, description_es, muscle_groups, muscle_groups_es, equipment, equipment_es, difficulty, exercise_type, is_compound, instructions, instructions_es, video_url, image_url, motion_preview_url')
    .eq('id', exerciseId)
    .eq('is_public', true)
    .maybeSingle() as unknown as { data: ExerciseRow | null; error: { message?: string } | null }

  if (exerciseError) throw new Error(exerciseError.message ?? 'Could not load exercise')
  const rawLogs: ExerciseLogRow[] = []
  const pageSize = 300
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('exercise_logs')
      .select(`
        id,
        progress_log_id,
        sets_completed,
        reps_completed,
        weights_kg,
        rpe_values,
        notes,
        progress_log:progress_logs!inner(id, workout_id, completed_at, duration_minutes, mood_rating, session_context_snapshot, user_id)
      `)
      .eq('exercise_id', exerciseId)
      .eq('progress_log.user_id', userId)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1) as unknown as {
        data: ExerciseLogRow[] | null
        error: { message?: string } | null
      }
    if (error) throw new Error(error.message ?? 'Could not load exercise appearances')
    const page = data ?? []
    rawLogs.push(...page.filter(row => getProgressLog(row)?.user_id === userId))
    if (page.length < pageSize) break
  }

  const logs = sortExerciseLogs(rawLogs)
  const exercise = catalogExercise ?? preservedExercise(exerciseId, logs)
  if (!exercise) return { exercise: null, logs: [], workoutsById: {}, historical: false }
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

  return { exercise, logs, workoutsById, historical: !catalogExercise }
}

async function loadExerciseDetailPayload(
  supabase: AppSupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<ExerciseDetailPayloadResult> {
  try {
    const { data, error } = await (supabase as unknown as ExerciseDetailRpcClient)
      .rpc('get_exercise_detail_payload', { p_exercise_id: exerciseId })
    if (!error && data?.exercise) {
      return {
        exercise: data.exercise ?? null,
        logs: sortExerciseLogs(data.logs ?? []),
        workoutsById: indexWorkouts(data.workouts ?? []),
        historical: false,
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

export default async function ExerciseDetailPage({ params: paramsPromise }: PageProps) {
  const params = await paramsPromise
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
  const technicalLabels: Record<string, string> = language === 'es' ? {
    strength: 'Fuerza', cardio: 'Cardio', stretching: 'Estiramiento', flexibility: 'Flexibilidad',
    plyometrics: 'Pliometría', powerlifting: 'Levantamiento de potencia', olympic_weightlifting: 'Halterofilia',
    beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado', expert: 'Experto',
  } : {}
  const context = [exercise.exercise_type, exercise.difficulty]
    .filter(Boolean)
    .map(value => technicalLabels[value!] ?? value)
    .join(' · ')
  const muscleGroups = Array.from(new Set((exercise.muscle_groups ?? []).map(group => localizeMuscleGroup(group, language))))
  const equipment = (exercise.equipment ?? []).map(item => localizeEquipment(item, language)).join(' · ')

  return (
    <div className="min-h-screen bg-background pb-20">
      <ExerciseHistoryAnchor />
      <PageTopBar
        title={t('Ficha de ejercicio')}
        backHref="/history"
        backLabel={t('Historial')}
        icon={<Dumbbell className="h-5 w-5" />}
      />

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:space-y-5 sm:px-6">
        <section data-exercise-overview aria-labelledby="exercise-name" className="rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.08] via-card to-card p-4 sm:p-5">
          <div className="flex items-start gap-4">
            {!payload.historical ? <ExerciseImage
              src={exercise.image_url}
              alt={exercise.name}
              variant="thumb"
              imageFit="contain"
              zoomable
              className="h-24 w-24 shrink-0 sm:h-28 sm:w-28"
            /> : null}
            <div className="min-w-0 flex-1 self-center">
              {context ? <p className="text-xs capitalize leading-relaxed text-muted-foreground">{context}</p> : null}
              <h2 id="exercise-name" className="mt-1 break-words font-display text-2xl font-bold leading-tight text-foreground sm:text-3xl">{exercise.name}</h2>
              {payload.historical ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{language === 'en' ? 'Information preserved in your history' : 'Información conservada en tu historial'}</p> : null}
              {exercise.is_compound !== null ? <p className="mt-2 text-xs text-violet-300">{exercise.is_compound ? (language === 'en' ? 'Compound movement' : 'Movimiento compuesto') : (language === 'en' ? 'Isolation movement' : 'Movimiento de aislamiento')}</p> : null}
            </div>
          </div>
          {muscleGroups.length > 0 || equipment ? (
            <dl className="mt-4 grid gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
              {muscleGroups.length > 0 ? <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{language === 'en' ? 'Muscles' : 'Músculos'}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">{muscleGroups.map(group => <span key={group} className="break-words rounded-md bg-violet-400/10 px-2 py-1 text-xs capitalize text-violet-200">{group}</span>)}</dd>
              </div> : null}
              {equipment ? <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t('Equipo')}</dt>
                <dd className="mt-1 break-words text-sm capitalize leading-relaxed text-foreground">{equipment}</dd>
              </div> : null}
            </dl>
          ) : null}
        </section>

        {!payload.historical ? <section id="tecnica" className="scroll-mt-24 rounded-2xl border border-border/60 bg-card p-4 sm:p-5" aria-labelledby="technique-title">
          <h2 id="technique-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Target className="h-4 w-4 text-violet-300" aria-hidden="true" />
            {language === 'en' ? 'Technique and setup' : 'Técnica y preparación'}
          </h2>
          {description ? <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
          {!description && !instructions && !exercise.video_url && !exercise.motion_preview_url ? <p className="mt-3 text-sm text-muted-foreground">{language === 'en' ? 'No technique information available for this exercise yet.' : 'Aún no hay indicaciones técnicas para este ejercicio.'}</p> : null}
          {instructions ? (
            <DisclosureSection summary={t('Mostrar instrucciones')} className="mt-3">
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{instructions}</p>
            </DisclosureSection>
          ) : null}
          {exercise.motion_preview_url ? <DisclosureSection summary={language === 'en' ? 'View demonstration' : 'Ver demostración'} className="mt-3">
            <ExerciseMotionPreview posterSrc={exercise.image_url} motionSrc={exercise.motion_preview_url} alt={exercise.name} language={language} className="mx-auto max-w-lg" />
          </DisclosureSection> : null}
          {exercise.video_url ? <a href={exercise.video_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border/60 px-3 text-sm font-semibold text-violet-300 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
            <PlayCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {language === 'en' ? 'Open technique video' : 'Abrir video de técnica'}
          </a> : null}
        </section> : null}

        <section aria-labelledby="exercise-records-title" className="rounded-2xl border border-border/60 bg-card px-4 pt-4 sm:px-5 sm:pt-5">
          <h2 id="exercise-records-title" className="mb-3 text-sm font-semibold text-foreground">{language === 'en' ? 'Your records' : 'Tus registros'}</h2>
          <MetricStrip
            className="grid-cols-2 gap-x-4 gap-y-3 [&_dd]:text-xl"
            items={[
              { label: t('Sesiones'), value: view.sessions, detail: view.latest ? `${language === 'en' ? 'Last: ' : 'Última: '}${view.latest.dateLabel}` : undefined },
              { label: t('Mejor peso'), value: view.best && view.best.maxWeightKg > 0 ? `${formatNumber(view.best.maxWeightKg, language)} kg` : '—', detail: view.best && view.best.maxWeightKg > 0 ? `${view.best.repsAtMaxWeight} reps · ${view.best.dateLabel}` : undefined },
              { label: language === 'en' ? 'Latest volume' : 'Último volumen', value: view.latest ? `${formatNumber(view.latest.volumeKg, language)} kg` : '—', detail: language === 'en' ? 'load × reps' : 'carga × repeticiones' },
              { label: 'RPE', value: view.latestAverageRpe ?? '—', detail: language === 'en' ? 'latest session' : 'última sesión' },
            ]}
          />
          <details className="group/progress mt-4 border-t border-border/60">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 py-3 text-sm font-semibold text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
              <ChartNoAxesColumnIncreasing className="h-4 w-4" aria-hidden="true" />
              {language === 'en' ? 'View progress' : 'Ver progreso'}
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open/progress:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-3 pb-4">
              <p className="text-xs leading-relaxed text-muted-foreground">{trendCopy(view.trend, language)}</p>
              <ExerciseProgressChart points={view.points} todayStr={todayStr} locale={language} />
            </div>
          </details>
        </section>

        <section aria-labelledby="exercise-history-title" className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
          <h2 id="exercise-history-title" className="scroll-mt-24 font-display text-xl font-bold text-foreground">{t('Historial del ejercicio')}</h2>

          {payload.logs.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/20 p-4 text-center">
              <Info className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-foreground">{t('Sin registros todavía')}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t('Cuando completes este ejercicio, aquí verás su progreso.')}</p>
            </div>
          ) : (
            <div className="mt-2">
              {payload.logs.map(row => {
                const progressLog = getProgressLog(row)!
                const point = pointByLogId.get(progressLog.id)
                const presentation = toExerciseHistoryPresentation(
                  { ...progressLog, session_context_snapshot: progressLog.session_context_snapshot ?? null },
                  payload.workoutsById,
                  t('Entrenamiento'),
                )
                const workoutName = getWorkoutDisplayName(presentation.workoutName, presentation.focus)
                const performance = summarizeExercisePerformance(row.weights_kg, row.reps_completed, row.rpe_values)

                return (
                  <SessionSummaryRow
                    key={row.id}
                    className="py-3"
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
