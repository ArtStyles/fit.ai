'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, Clock, Dumbbell, Loader2, TrendingUp, Weight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSessionStore } from '@/store/sessionStore'
import { hapticSuccess } from '@/lib/native/haptics'
import { saveSession, type PRRecord } from '@/app/actions/saveSession'
import type { ProgressionSuggestion } from '@/lib/progression'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import { ShareSessionButton } from '@/components/social/ShareSessionButton'
import { SessionSyncStatus } from './SessionSyncStatus'
import {
  syncEventForStorageResult,
  type SessionSyncErrorSource,
  type SessionSyncEvent,
  type SessionSyncState,
} from './sessionViewModel'
import { createSessionRequestGate } from './sessionRequestGate'
import type { PersistenceResult } from '@/lib/session/persistSession'

const containerMotion = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
}

const itemMotion = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
}

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`
}

function prDetail(pr: PRRecord): string {
  if (pr.kind === 'e1rm') return `1RM: ${pr.e1rmKg} kg`
  if (pr.kind === 'reps') return `${pr.reps} reps`
  return `${pr.weightKg} kg`
}

function isActionableProgression(suggestion: ProgressionSuggestion): boolean {
  return suggestion.confidence !== 'low' && (
    suggestion.nextWeightKg !== null || suggestion.nextTargetReps !== null
  )
}

function progressionTarget(suggestion: ProgressionSuggestion): string {
  if (suggestion.progressionType === 'reps') return `${suggestion.nextTargetReps ?? '—'} reps`
  return suggestion.nextWeightKg === null ? '—' : `${suggestion.nextWeightKg} kg`
}

interface Props {
  workoutId: string
  communityEnabled: boolean
  syncState: SessionSyncState
  syncErrorSource: SessionSyncErrorSource
  onSyncEvent: (event: SessionSyncEvent, source?: SessionSyncErrorSource) => void
  onRetryLocalBackup: () => void
  onClearBackup: () => PersistenceResult
}

export function CompletionScreen({
  workoutId,
  communityEnabled,
  syncState,
  syncErrorSource,
  onSyncEvent,
  onRetryLocalBackup,
  onClearBackup,
}: Props) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const { showToast } = useToast()
  const { t } = useI18n()
  const exercises = useSessionStore(state => state.exercises)
  const startedAt = useSessionStore(state => state.startedAt)
  const finishedAt = useSessionStore(state => state.finishedAt)
  const workoutName = useSessionStore(state => state.workoutName)
  const clientSessionId = useSessionStore(state => state.clientSessionId)
  const prescriptionLocked = useSessionStore(state => state.prescriptionLocked)
  const clearSession = useSessionStore(state => state.clearSession)
  const requestGateRef = useRef(createSessionRequestGate())
  const serverSavedRef = useRef<string | null>(null)

  const [moodRating, setMoodRating] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [prs, setPrs] = useState<PRRecord[]>([])
  const [progressions, setProgressions] = useState<ProgressionSuggestion[]>([])
  const [progressLogId, setProgressLogId] = useState<string | null>(null)
  const [cleanupComplete, setCleanupComplete] = useState(false)

  useEffect(() => () => requestGateRef.current.invalidate(), [])

  const completedExercises = exercises.filter(exercise => exercise.status === 'completed').length
  const completedSets = exercises.reduce(
    (total, exercise) => total + exercise.sets.filter(set => set.completed).length,
    0,
  )
  const totalVolumeKg = exercises.reduce((total, exercise) => total + exercise.sets.reduce((setTotal, set) => {
    if (!set.completed) return setTotal
    return setTotal + (Number(set.weightKg) || 0) * (Number(set.reps) || 0)
  }, 0), 0)
  const visibleProgressions = progressions.filter(isActionableProgression).slice(0, 3)
  const saved = progressLogId !== null

  const retryCleanup = useCallback(() => {
    onSyncEvent('retry')
    const result = onClearBackup()
    onSyncEvent(syncEventForStorageResult('delete', result), result.ok ? null : 'backup-delete')
    setCleanupComplete(result.ok)
    setSaveError(result.ok ? null : t('La sesión está guardada, pero falta limpiar el respaldo local.'))
  }, [onClearBackup, onSyncEvent, t])

  const doSave = useCallback(async () => {
    if (serverSavedRef.current) return
    const requestToken = requestGateRef.current.begin()
    if (requestToken === null) return

    if (syncErrorSource === 'server') onSyncEvent('retry')
    else onSyncEvent('server-save')
    setIsSaving(true)
    setSaveError(null)

    try {
      const result = await saveSession({
        clientSessionId,
        workoutId,
        startedAt,
        finishedAt: finishedAt || Date.now(),
        moodRating,
        prescriptionLocked,
        exercises: exercises.map(exercise => ({
          workoutExerciseId: exercise.workoutExerciseId,
          exerciseId: exercise.exerciseId,
          originalExerciseId: exercise.originalExerciseId,
          originalName: exercise.originalName,
          name: exercise.name,
          isCompound: exercise.isCompound,
          targetSets: exercise.targetSets,
          targetReps: exercise.targetReps,
          targetDuration: exercise.targetDuration,
          targetRpe: exercise.targetRpe,
          source: exercise.source,
          skipReason: exercise.skipReason,
          sets: exercise.sets,
          status: exercise.status,
        })),
      })

      if (!result.success || !result.progressLogId) {
        const message = t(result.error ?? 'No se pudo guardar la sesión')
        requestGateRef.current.commit(requestToken, () => {
          setSaveError(message)
          onSyncEvent('server-error', 'server')
          showToast({ title: t('No se pudo guardar'), description: message, variant: 'error' })
        })
        return
      }

      requestGateRef.current.commit(requestToken, () => {
        serverSavedRef.current = result.progressLogId
        setPrs(result.prs)
        setProgressions(result.progressions)
        setProgressLogId(result.progressLogId)

        const cleanupResult = onClearBackup()
        const cleanupEvent = syncEventForStorageResult('delete', cleanupResult)
        onSyncEvent(cleanupEvent, cleanupResult.ok ? null : 'backup-delete')
        setCleanupComplete(cleanupResult.ok)

        if (cleanupResult.ok) {
          setSaveError(null)
          void hapticSuccess()
          showToast({ title: t('Sesión guardada'), description: t('Tu progreso quedó sincronizado.'), variant: 'success' })
        } else {
          const cleanupMessage = t('La sesión está guardada, pero falta limpiar el respaldo local.')
          setSaveError(cleanupMessage)
          showToast({ title: t('Limpieza local pendiente'), description: cleanupMessage, variant: 'error' })
        }
      })
    } catch {
      const message = t('Error de red')
      requestGateRef.current.commit(requestToken, () => {
        setSaveError(message)
        onSyncEvent('server-error', 'server')
        showToast({ title: t('Error de sincronización'), description: message, variant: 'error' })
      })
    } finally {
      if (requestGateRef.current.finish(requestToken)) setIsSaving(false)
    }
  }, [clientSessionId, exercises, finishedAt, moodRating, onClearBackup, onSyncEvent, prescriptionLocked, showToast, startedAt, syncErrorSource, t, workoutId])

  function handleDone() {
    if (!cleanupComplete) return
    clearSession()
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.replace('/dashboard')
  }

  return (
    <motion.main
      variants={containerMotion}
      initial={reduceMotion ? false : 'hidden'}
      animate="visible"
      className="h-full overflow-y-auto bg-background px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-8"
    >
      <div className="mx-auto w-full max-w-lg space-y-6">
        <motion.section variants={itemMotion} data-section="session-complete" className="space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-violet-300">{t('Sesión completa')}</p>
            <h1 className="mt-1 font-display text-3xl font-bold text-foreground">{workoutName}</h1>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat icon={Clock} value={formatDuration((finishedAt || Date.now()) - startedAt)} label={t('Duración')} />
            <Stat icon={Dumbbell} value={String(completedSets)} label={t('Series')} />
            <Stat icon={Weight} value={totalVolumeKg > 0 ? `${Math.round(totalVolumeKg)} kg` : '—'} label={t('Volumen')} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('{count} ejercicios completados', { count: completedExercises })}
          </p>

          <SessionSyncStatus
            state={syncState}
            onRetry={syncState === 'error'
              ? syncErrorSource === 'backup-delete' ? retryCleanup
                : syncErrorSource === 'backup-write' ? onRetryLocalBackup
                  : doSave
              : undefined}
          />
          {saveError ? <p role="alert" className="text-sm text-red-300">{saveError}</p> : null}

          {!saved ? (
            <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-4">
              <fieldset>
                <legend className="text-sm font-medium text-foreground">{t('¿Cómo te sentiste?')} <span className="text-muted-foreground">{t('(opcional)')}</span></legend>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map(value => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMoodRating(value)}
                      aria-label={t('Estado {value} de 5', { value })}
                      aria-pressed={moodRating === value}
                      className="min-h-[44px] rounded-lg border border-border/60 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 aria-pressed:border-violet-400 aria-pressed:bg-violet-500/15 aria-pressed:text-violet-200"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Button onClick={doSave} disabled={isSaving} className="h-14 w-full bg-violet-600 text-base font-bold text-white hover:bg-violet-500">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                {isSaving ? t('Sincronizando') : t('Guardar sesión')}
              </Button>
            </div>
          ) : null}
        </motion.section>

        <motion.section variants={itemMotion} data-section="records" className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
          <h2 className="text-lg font-semibold text-foreground">{t('Récords y mejoras')}</h2>
          {saved && prs.length > 0 ? prs.slice(0, 3).map(pr => (
            <div key={`${pr.exerciseName}-${pr.kind}`} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-foreground">{pr.exerciseName}</span>
              <span className="shrink-0 font-semibold tabular-nums text-violet-200">{prDetail(pr)}</span>
            </div>
          )) : <p className="text-sm text-muted-foreground">{saved ? t('Sin nuevos récords en esta sesión.') : t('Se calcularán al sincronizar la sesión.')}</p>}
        </motion.section>

        <motion.section variants={itemMotion} data-section="weekly-continuity" className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
          <h2 className="text-base font-semibold text-foreground">{t('Continuidad semanal')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {saved ? t('Esta sesión suma a tu continuidad semanal.') : t('Se reflejará cuando la sesión se sincronice.')}
          </p>
        </motion.section>

        <motion.section variants={itemMotion} data-section="progression-suggestions" className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">{t('Sugerencias para la próxima vez')}</h2>
          {saved && visibleProgressions.length > 0 ? visibleProgressions.map(suggestion => (
            <div key={suggestion.exerciseId} className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-violet-300" aria-hidden="true" />
                <p className="font-semibold text-foreground">{suggestion.exerciseName}</p>
              </div>
              <p className="mt-1 text-sm font-medium text-violet-200">{progressionTarget(suggestion)}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{suggestion.reason}</p>
            </div>
          )) : <p className="text-sm text-muted-foreground">{saved ? t('Mantén los objetivos actuales la próxima vez.') : t('Disponibles después de sincronizar.')}</p>}
        </motion.section>

        {communityEnabled ? (
          <motion.section variants={itemMotion} data-section="share" className="flex justify-start">
            {progressLogId && cleanupComplete ? <ShareSessionButton progressLogId={progressLogId} /> : null}
          </motion.section>
        ) : null}

        <motion.section variants={itemMotion} data-section="dashboard">
          <Button onClick={handleDone} disabled={!saved || !cleanupComplete} className="h-14 w-full bg-violet-600 text-base font-bold text-white hover:bg-violet-500">
            <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden="true" />
            {t('Volver al dashboard')}
          </Button>
        </motion.section>
      </div>
    </motion.main>
  )
}

function Stat({ icon: Icon, value, label }: { icon: typeof Clock; value: string; label: string }) {
  return (
    <div className="flex min-h-[96px] flex-col items-center justify-center rounded-xl border border-border/60 bg-card px-2 text-center">
      <Icon className="h-4 w-4 text-violet-300" aria-hidden="true" />
      <span className="mt-2 font-display text-lg font-bold tabular-nums text-foreground">{value}</span>
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
