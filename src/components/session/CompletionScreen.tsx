'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowDown,
  CheckCircle2,
  Clock,
  Dumbbell,
  Loader2,
  Minus,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Weight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/store/sessionStore'
import { saveSession } from '@/app/actions/saveSession'
import type { PRRecord } from '@/app/actions/saveSession'
import type { ProgressionSuggestion } from '@/lib/progression'
import { SyncStatusIndicator } from '@/components/session/SyncStatusIndicator'
import { useToast } from '@/components/feedback/ToastProvider'

const containerMotion = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
}

const itemMotion = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.34 },
  },
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const MOODS: { value: number; emoji: string; label: string }[] = [
  { value: 1, emoji: '😞', label: 'Mal' },
  { value: 2, emoji: '😕', label: 'Regular' },
  { value: 3, emoji: '😐', label: 'Normal' },
  { value: 4, emoji: '😊', label: 'Bien' },
  { value: 5, emoji: '😄', label: 'Genial' },
]

function MoodSelector({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number) => void
}) {
  return (
    <motion.div variants={itemMotion} className="space-y-2">
      <p className="text-center text-sm text-muted-foreground">
        ¿Cómo te sentiste? <span className="text-xs">(opcional)</span>
      </p>
      <div className="flex justify-center gap-2">
        {MOODS.map(mood => (
          <button
            key={mood.value}
            type="button"
            onClick={() => onChange(mood.value)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl border px-2.5 py-2 transition-all',
              value === mood.value
                ? 'scale-110 border-indigo-500 bg-indigo-500/10'
                : 'border-border/40 bg-muted/10 hover:border-border hover:bg-muted/20',
            )}
            aria-label={mood.label}
          >
            <span className="text-2xl leading-none">{mood.emoji}</span>
            <span
              className={cn(
                'text-[10px] font-medium',
                value === mood.value ? 'text-indigo-300' : 'text-muted-foreground',
              )}
            >
              {mood.label}
            </span>
          </button>
        ))}
      </div>
    </motion.div>
  )
}

function PRBadge({ pr, index }: { pr: PRRecord; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.75, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.38, delay: 0.12 + index * 0.1, ease: [0.34, 1.3, 0.64, 1] }}
      className="flex items-center gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/8 px-3 py-3 text-left shadow-sm shadow-yellow-900/20"
      style={{ background: 'rgba(234,179,8,0.06)' }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-yellow-500/15">
        <Trophy className="h-4 w-4 text-yellow-300" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight text-yellow-200">
          Nuevo PR — {pr.exerciseName}
        </p>
        <p className="text-xs text-yellow-500/80">{pr.weightKg} kg</p>
      </div>
      <span className="fitai-pop shrink-0 text-lg">🏆</span>
    </motion.div>
  )
}

function formatWeight(weight: number | null): string {
  if (weight === null) return 'pendiente'
  return `${weight} kg`
}

function ProgressionIcon({ action }: { action: ProgressionSuggestion['action'] }) {
  if (action === 'increase') return <TrendingUp className="h-4 w-4 text-emerald-400" />
  if (action === 'decrease') return <TrendingDown className="h-4 w-4 text-amber-400" />
  if (action === 'baseline') return <Target className="h-4 w-4 text-violet-300" />
  return <Minus className="h-4 w-4 text-muted-foreground" />
}

function progressionSummary(suggestion: ProgressionSuggestion): string {
  if (suggestion.action === 'increase') return `Sube a ${formatWeight(suggestion.nextWeightKg)}`
  if (suggestion.action === 'decrease') return `Baja a ${formatWeight(suggestion.nextWeightKg)}`
  if (suggestion.action === 'baseline') return `Baseline: ${formatWeight(suggestion.nextWeightKg)}`
  return `Mantén ${formatWeight(suggestion.nextWeightKg)}`
}

function ProgressionCard({ suggestion }: { suggestion: ProgressionSuggestion }) {
  return (
    <motion.div
      variants={itemMotion}
      className="flex gap-3 rounded-2xl border border-violet-500/20 bg-violet-500/5 px-4 py-4 text-left"
    >
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70">
        <ProgressionIcon action={suggestion.action} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{suggestion.exerciseName}</p>
        <p className="mt-0.5 text-sm font-medium text-violet-200">
          {progressionSummary(suggestion)}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {suggestion.reason}
        </p>
      </div>
    </motion.div>
  )
}

// ─── Generador de insight post-sesión ────────────────────────────────────────

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

function generateSessionInsight(params: {
  prCount:          number
  progressionCount: number
  volumeKg:         number
  completedSets:    number
  isPerfect:        boolean
}): string {
  const { prCount, progressionCount, volumeKg, completedSets, isPerfect } = params
  const v = new Date().getDate() % 3

  if (prCount > 0 && progressionCount > 0) {
    return pick([
      `${prCount} nuevo${prCount > 1 ? 's' : ''} PR y ${progressionCount} progresión${progressionCount > 1 ? 'es' : ''} activada${progressionCount > 1 ? 's' : ''}. Uno de tus mejores días.`,
      `Nuevas marcas y el sistema ya actualizó tus cargas. Así se construye fuerza real.`,
      `PR + progresiones: combinación perfecta. Esto es lo que pasa cuando eres consistente.`,
    ], v)
  }

  if (prCount > 0) {
    return pick([
      `${prCount > 1 ? `${prCount} nuevos PRs` : 'Nuevo PR'} hoy. Tu fuerza sigue creciendo.`,
      `Marcas personales batidas. El trabajo está dando resultados concretos.`,
      `${prCount > 1 ? 'Varios récords' : 'Récord'} nuevo${prCount > 1 ? 's' : ''}. No pasa por accidente — es consistencia acumulada.`,
    ], v)
  }

  if (progressionCount > 0) {
    return pick([
      `Sesión sólida. La IA ajustó ${progressionCount} ejercicio${progressionCount > 1 ? 's' : ''} para la próxima vez.`,
      `${progressionCount} progresión${progressionCount > 1 ? 'es' : ''} lista${progressionCount > 1 ? 's' : ''} para el siguiente entrenamiento. Sigue así.`,
      `El sistema detectó que puedes más en ${progressionCount} ejercicio${progressionCount > 1 ? 's' : ''}. Buena señal.`,
    ], v)
  }

  if (isPerfect) {
    return pick([
      `${completedSets} series completadas sin saltarte nada. Eso es disciplina.`,
      `Sesión 100% completada.${volumeKg > 0 ? ` ${Math.round(volumeKg)} kg de volumen total.` : ''} Excelente trabajo.`,
      `Todo completado. Esa constancia es lo que separa los resultados a largo plazo.`,
    ], v)
  }

  if (volumeKg >= 5000) {
    return pick([
      `${(Math.round(volumeKg / 100) / 10).toFixed(1)} toneladas de volumen hoy. Sesión de alto rendimiento.`,
      `Gran día de volumen — ${Math.round(volumeKg)} kg movidos en total.`,
      `Sesión intensa: ${Math.round(volumeKg)} kg. Asegúrate de descansar bien.`,
    ], v)
  }

  return pick([
    `${completedSets} series registradas. Cada sesión es un ladrillo más.`,
    `Progreso guardado. La constancia a largo plazo es lo que funciona.`,
    `Sesión anotada. Los datos están ahí para la próxima vez.`,
  ], v)
}

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  workoutId: string
  onClearBackup: () => void
}

export function CompletionScreen({ workoutId, onClearBackup }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const exercises = useSessionStore(state => state.exercises)
  const startedAt = useSessionStore(state => state.startedAt)
  const finishedAt = useSessionStore(state => state.finishedAt)
  const workoutName = useSessionStore(state => state.workoutName)
  const clearSession = useSessionStore(state => state.clearSession)
  const setSyncStatus = useSessionStore(state => state.setSyncStatus)

  const [moodRating, setMoodRating] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [prs, setPrs] = useState<PRRecord[]>([])
  const [progressions, setProgressions] = useState<ProgressionSuggestion[]>([])
  const [saved, setSaved] = useState(false)
  const [insight, setInsight] = useState<string | null>(null)

  const durationMs = (finishedAt || Date.now()) - startedAt
  const completedExercises = exercises.filter(exercise => exercise.status === 'completed').length
  const skippedExercises = exercises.filter(exercise => exercise.status === 'skipped').length
  const totalExercises = exercises.filter(exercise => exercise.status !== 'skipped').length
  const completedSets = exercises.reduce(
    (acc, exercise) => acc + exercise.sets.filter(set => set.completed).length,
    0,
  )
  const totalVolumeKg = exercises.reduce((acc, exercise) =>
    acc + exercise.sets.reduce((setAcc, set) => {
      if (!set.completed) return setAcc
      return setAcc + (parseFloat(set.weightKg) || 0) * (parseInt(set.reps) || 0)
    }, 0),
  0)

  const visiblePrs = prs.slice(0, 3)
  const hiddenPrCount = Math.max(0, prs.length - visiblePrs.length)
  const visibleProgressions = progressions
    .filter(suggestion => suggestion.nextWeightKg !== null && suggestion.confidence !== 'low')
    .slice(0, 3)

  const doSave = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)
    setSyncStatus('saving')

    try {
      const result = await saveSession({
        workoutId,
        startedAt,
        finishedAt: finishedAt || Date.now(),
        moodRating,
        exercises: exercises.map(exercise => ({
          workoutExerciseId: exercise.workoutExerciseId,
          exerciseId: exercise.exerciseId,
          originalExerciseId: exercise.originalExerciseId,
          originalName: exercise.originalName,
          name: exercise.name,
          isCompound: exercise.isCompound,
          targetSets: exercise.targetSets,
          targetReps: exercise.targetReps,
          targetRpe: exercise.targetRpe,
          source: exercise.source,
          skipReason: exercise.skipReason,
          sets: exercise.sets,
          status: exercise.status,
        })),
      })

      if (result.success) {
        onClearBackup()
        setPrs(result.prs)
        setProgressions(result.progressions)
        setSaved(true)
        setSyncStatus('saved')
        const qualityProgressions = result.progressions.filter(
          s => s.nextWeightKg !== null && s.confidence !== 'low',
        ).length
        setInsight(generateSessionInsight({
          prCount:          result.prs.length,
          progressionCount: qualityProgressions,
          volumeKg:         totalVolumeKg,
          completedSets,
          isPerfect,
        }))
        // Haptic: short-pause-long = success pattern
        navigator.vibrate?.([60, 40, 120])
        const progressionCount = result.progressions.filter(
          suggestion => suggestion.nextWeightKg !== null && suggestion.confidence !== 'low',
        ).length
        showToast({
          title: 'Sesión guardada',
          description: result.prs.length > 0
            ? `${result.prs.length} nuevo${result.prs.length === 1 ? '' : 's'} PR detectado${result.prs.length === 1 ? '' : 's'}.`
            : progressionCount > 0
              ? `${progressionCount} ajuste${progressionCount === 1 ? '' : 's'} listo${progressionCount === 1 ? '' : 's'} para la próxima vez.`
              : 'Tu progreso quedó sincronizado.',
          variant: 'success',
        })
      } else {
        const message = result.error ?? 'Error desconocido'
        setSaveError(message)
        setSyncStatus('error')
        showToast({
          title: 'No se pudo guardar',
          description: message,
          variant: 'error',
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de red'
      setSaveError(message)
      setSyncStatus('error')
      showToast({
        title: 'Error de sincronización',
        description: message,
        variant: 'error',
      })
    } finally {
      setIsSaving(false)
    }
  }, [workoutId, startedAt, finishedAt, moodRating, exercises, onClearBackup, setSyncStatus, showToast])

  function handleDone() {
    clearSession()
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.replace('/dashboard')
  }

  function scrollToNextView() {
    document.getElementById('next-session-view')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  const isPerfect = completedExercises === totalExercises && totalExercises > 0

  return (
    <div className="relative z-50 h-dvh snap-y snap-proximity overflow-y-auto scroll-smooth bg-background">
      <SyncStatusIndicator className="fixed bottom-4 right-4 z-50 rounded-full border border-border/60 bg-background/90 px-2 py-1 shadow-lg backdrop-blur-sm" />

      <section className="flex min-h-dvh snap-start items-center px-5 py-10">
        <motion.div
          variants={containerMotion}
          initial="hidden"
          animate="visible"
          className="mx-auto flex w-full max-w-lg flex-col items-center text-center"
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 1.28, 0.88, 1.1, 1], opacity: [0, 1, 1, 1, 1] }}
            transition={{ duration: 0.85, times: [0, 0.42, 0.6, 0.78, 1], ease: 'easeOut', delay: 0.08 }}
            className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-xl shadow-indigo-900/40"
          >
            <Trophy className="h-11 w-11 text-white" />
          </motion.div>

          <motion.div variants={itemMotion}>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {isPerfect ? '¡Sesión perfecta!' : '¡Entrenamiento completado!'}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{workoutName}</p>
          </motion.div>

          <motion.div variants={itemMotion} className="mt-8 grid w-full grid-cols-3 gap-3">
            <StatTile
              icon={<Clock className="h-5 w-5 text-indigo-400" />}
              value={formatDuration(durationMs)}
              label="duración"
            />
            <StatTile
              icon={<Dumbbell className="h-5 w-5 text-orange-400" />}
              value={String(completedSets)}
              label={completedSets === 1 ? 'serie' : 'series'}
            />
            <StatTile
              icon={<Weight className="h-5 w-5 text-emerald-400" />}
              value={totalVolumeKg > 0
                ? totalVolumeKg >= 1000
                  ? `${(totalVolumeKg / 1000).toFixed(1)}t`
                  : `${Math.round(totalVolumeKg)}kg`
                : '—'}
              label="volumen"
            />
          </motion.div>

          <motion.p variants={itemMotion} className="mt-4 text-xs text-muted-foreground">
            {completedExercises} de {totalExercises} ejercicios completados
            {skippedExercises > 0 && ` · ${skippedExercises} saltados`}
          </motion.p>

          {visiblePrs.length > 0 && (
            <motion.section variants={containerMotion} className="mt-7 w-full space-y-2">
              <motion.div variants={itemMotion} className="text-left">
                <p className="text-sm font-semibold text-foreground">Logros de hoy</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  PRs detectados al guardar la sesión.
                </p>
              </motion.div>
              {visiblePrs.map((pr, index) => (
                <PRBadge key={`${pr.exerciseName}-${pr.weightKg}`} pr={pr} index={index} />
              ))}
              {hiddenPrCount > 0 && (
                <motion.p variants={itemMotion} className="text-left text-xs text-muted-foreground">
                  +{hiddenPrCount} PR{hiddenPrCount === 1 ? '' : 's'} más registrados.
                </motion.p>
              )}
            </motion.section>
          )}

          {!saved && (
            <div className="mt-8 w-full space-y-5">
              <MoodSelector value={moodRating} onChange={setMoodRating} />

              {saveError && (
                <motion.div
                  variants={itemMotion}
                  className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span className="text-sm text-red-400">{saveError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={doSave}
                    className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Reintentar
                  </button>
                </motion.div>
              )}

              <motion.div variants={itemMotion}>
                <Button
                  className="h-14 w-full bg-indigo-500 text-base font-bold text-white hover:bg-indigo-600 disabled:opacity-60"
                  disabled={isSaving}
                  onClick={doSave}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    'Guardar sesión'
                  )}
                </Button>
              </motion.div>
            </div>
          )}

          {saved && (
            <motion.div variants={itemMotion} className="mt-8 w-full">
              <Button
                className="h-12 w-full border border-violet-500/30 bg-violet-500/10 text-sm font-semibold text-violet-100 hover:bg-violet-500/20"
                variant="ghost"
                onClick={scrollToNextView}
              >
                {visibleProgressions.length > 0 ? 'Ver ajustes para la próxima vez' : 'Ver cierre'}
                <ArrowDown className="ml-2 h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </motion.div>
      </section>

      {saved && (
        <section id="next-session-view" className="flex min-h-dvh snap-start items-center px-5 py-10">
          <motion.div
            variants={containerMotion}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.25 }}
            className="mx-auto flex w-full max-w-lg flex-col"
          >
            <motion.div variants={itemMotion} className="text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-300/80">
                Próxima mejora
              </p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">
                {visibleProgressions.length > 0 ? 'Tu siguiente paso está listo' : 'Progreso sincronizado'}
              </h2>
            </motion.div>

            {/* Insight generado por IA */}
            {insight && (
              <motion.div
                variants={itemMotion}
                className="mt-4 rounded-2xl border border-violet-500/15 bg-violet-500/5 px-4 py-3.5 space-y-2"
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-violet-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80">
                    Coach IA
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-foreground/80">{insight}</p>
              </motion.div>
            )}

            {visibleProgressions.length > 0 && (
              <motion.div variants={containerMotion} className="mt-6 space-y-3">
                {visibleProgressions.map(suggestion => (
                  <ProgressionCard key={suggestion.exerciseId} suggestion={suggestion} />
                ))}
              </motion.div>
            )}

            <motion.div variants={itemMotion} className="mt-8 space-y-4">
              <div className="flex items-center justify-center gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-4">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <span className="text-sm font-medium text-green-400">Sesión guardada correctamente</span>
              </div>
              <Button
                className="h-14 w-full bg-indigo-500 text-base font-bold text-white hover:bg-indigo-600"
                onClick={handleDone}
              >
                Volver al inicio
              </Button>
            </motion.div>
          </motion.div>
        </section>
      )}
    </div>
  )
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: string
  label: string
}) {
  return (
    <div className="flex min-h-[126px] flex-col items-center justify-center gap-2 rounded-2xl border border-border/60 bg-muted/10 px-2 py-4">
      {icon}
      <span className="text-xl font-bold leading-none text-foreground">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}
