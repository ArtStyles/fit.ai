'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, LoaderCircle, ShieldAlert } from 'lucide-react'
import { useSessionStore }    from '@/store/sessionStore'
import { useRestTimer }       from '@/hooks/useRestTimer'
import { useWakeLock }        from '@/hooks/useWakeLock'
import { SessionHeader }      from '@/components/session/SessionHeader'
import { ExerciseCard }       from '@/components/session/ExerciseCard'
import { CompletionScreen }   from '@/components/session/CompletionScreen'
import { SessionRoutineTools } from '@/components/session/SessionRoutineTools'
import { PreSessionScreen }   from '@/components/session/PreSessionScreen'
import { ReadinessReviewDialog } from '@/components/plan/ReadinessReviewDialog'
import {
  buildSessionFocusWindow,
  nextSessionSyncState,
  syncEventForStorageResult,
  type SessionSyncErrorSource,
  type SessionSyncEvent,
  type SessionSyncState,
} from '@/components/session/sessionViewModel'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { ProgressionItem } from '@/components/session/PreSessionScreen'
import { saveBackup, recoverSessionBackup, clearBackup } from '@/lib/session/persistSession'
import type { ExerciseSession, SessionExerciseDraft } from '@/store/sessionStore'
import type { SessionSnapshot } from '@/lib/session/persistSession'
import { authorizeSessionStart, verifySessionBackupOwner } from '@/app/actions/authorizeSession'
import {
  nextSessionAuthorizationState,
  runSessionAuthorizationAttempt,
  type SessionAuthorizationState,
  type SessionReadinessBlock,
} from '@/lib/session/authorization'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  userId: string
  workoutId:        string
  workoutName:      string
  estimatedMinutes: number | null
  communityEnabled: boolean
  exercises:        ExerciseSession[]   // estado inicial del servidor
  exerciseOptions:  SessionExerciseDraft[]
  prescriptionLocked: boolean
}

// ─── SessionClient ────────────────────────────────────────────────────────────

// Extrae las progresiones a mostrar en la pantalla pre-sesión
function extractProgressions(exercises: ExerciseSession[]): ProgressionItem[] {
  return exercises
    .filter(e => e.weightSuggestionBasis === 'based_on_previous_logs' && e.suggestedWeight != null)
    .map(e => {
      const prefilledWeight = e.sets[0]?.weightKg ? Number(e.sets[0].weightKg) || null : null
      return {
        weId:         e.workoutExerciseId,
        name:         e.name,
        muscleGroups: e.muscleGroups,
        fromWeightKg: e.hasLastSessionData ? prefilledWeight : null,
        toWeightKg:   e.suggestedWeight!,
      }
    })
    // Solo mostrar si el peso sugerido es realmente diferente al pre-rellenado
    .filter(p => p.fromWeightKg == null || p.fromWeightKg !== p.toWeightKg)
}

export function SessionClient({ userId, workoutId, workoutName, exercises, exerciseOptions, communityEnabled, prescriptionLocked }: Props) {
  const { t } = useI18n()
  const initSession       = useSessionStore(s => s.initSession)
  const restoreSession    = useSessionStore(s => s.restoreSession)
  const applyProgressions = useSessionStore(s => s.applyProgressions)
  const finishSession     = useSessionStore(s => s.finishSession)
  const isFinished        = useSessionStore(s => s.isFinished)
  const storeExercises    = useSessionStore(s => s.exercises)
  const [authorizationState, setAuthorizationState] = useState<SessionAuthorizationState>('authorizing')
  const [authorizationError, setAuthorizationError] = useState<string | null>(null)
  const [readinessStatus, setReadinessStatus] = useState<SessionReadinessBlock | null>(null)
  const [readinessGeneration, setReadinessGeneration] = useState(0)
  const [readinessOpen, setReadinessOpen] = useState(false)
  const readinessTriggerRef = useRef<HTMLButtonElement>(null)
  const autoOpenedReadinessSessionRef = useRef<string | null>(null)
  const sessionLifecycleRef = useRef({ generation: 0, active: false })
  const isCurrentSessionLifecycle = useCallback((generation: number) => (
    sessionLifecycleRef.current.active && sessionLifecycleRef.current.generation === generation
  ), [])
  const [syncState, setSyncState] = useState<SessionSyncState>('syncing')
  const [syncErrorSource, setSyncErrorSource] = useState<SessionSyncErrorSource>(null)
  const focusWindow = buildSessionFocusWindow(storeExercises)
  const latestBackupRef = useRef<SessionSnapshot | null>(null)
  const authorizationAttemptRef = useRef(0)
  const initializationAttemptRef = useRef(0)
  const onSyncEvent = useCallback((event: SessionSyncEvent, source: SessionSyncErrorSource = null) => {
    setSyncState(current => nextSessionSyncState(current, event))
    setSyncErrorSource(event === 'local-error' || event === 'server-error' ? source : null)
  }, [])
  const retryLocalBackup = useCallback(() => {
    const snapshot = latestBackupRef.current
    if (!snapshot) return { ok: false as const, error: 'Session backup unavailable' }
    onSyncEvent('retry')
    const result = saveBackup(snapshot)
    onSyncEvent(syncEventForStorageResult('write', result), result.ok ? null : 'backup-write')
    return result
  }, [onSyncEvent])
  const authorizeCurrentSession = useCallback(async (generation: number) => {
    if (!isCurrentSessionLifecycle(generation)) return
    const attempt = ++authorizationAttemptRef.current
    setAuthorizationState(current => nextSessionAuthorizationState(current, 'retry'))
    setAuthorizationError(null)
    setReadinessStatus(null)
    setReadinessGeneration(0)

    const state = useSessionStore.getState()
    if (!state.clientSessionId || state.workoutId !== workoutId || state.userId !== userId) {
      setAuthorizationState(current => nextSessionAuthorizationState(current, 'failed'))
      setAuthorizationError(t('No se pudo preparar la sesión. Inténtalo nuevamente.'))
      return
    }

    const snapshot: SessionSnapshot = {
      userId,
      clientSessionId: state.clientSessionId,
      activationState: state.activationState,
      workoutId: state.workoutId,
      workoutName: state.workoutName,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
      exercises: state.exercises,
    }
    latestBackupRef.current = snapshot

    // A lost response can only be retried safely if this exact ID is already local.
    const backupResult = saveBackup(snapshot)
    onSyncEvent(
      syncEventForStorageResult('write', backupResult),
      backupResult.ok ? null : 'backup-write',
    )
    if (!backupResult.ok) {
      if (attempt !== authorizationAttemptRef.current) return
      setAuthorizationState(current => nextSessionAuthorizationState(current, 'failed'))
      setAuthorizationError(t('No se pudo respaldar la sesión. Libera espacio y vuelve a intentar.'))
      return
    }

    const result = await runSessionAuthorizationAttempt(
      () => authorizeSessionStart(state.clientSessionId, workoutId),
      () => isCurrentSessionLifecycle(generation) && attempt === authorizationAttemptRef.current,
      t('No se pudo preparar la sesión. Inténtalo nuevamente.'),
    )
    if (result.status === 'stale') return

    if (result.status === 'failed') {
      if (result.authorizationAbsent) {
        // Older backups published themselves before authorization. Keep every
        // exercise and the retry ID, but stop presenting a verified non-start as active.
        useSessionStore.getState().markSessionPreparing(state.clientSessionId)
      }
      setAuthorizationState(current => nextSessionAuthorizationState(current, 'failed'))
      setAuthorizationError(t(result.error))
      setReadinessStatus(result.readinessStatus ?? null)
      setReadinessGeneration(generation)
      if (result.readinessStatus === 'pending' && autoOpenedReadinessSessionRef.current !== state.clientSessionId) {
        autoOpenedReadinessSessionRef.current = state.clientSessionId
        setReadinessOpen(true)
      }
      return
    }

    if (!useSessionStore.getState().markSessionActive(state.clientSessionId)) return
    setAuthorizationState(current => nextSessionAuthorizationState(current, 'succeeded'))
  }, [isCurrentSessionLifecycle, onSyncEvent, t, userId, workoutId])

  // Pre-calcular progresiones desde la prop del servidor (antes de hidratación)
  const progressions = extractProgressions(exercises)

  // Mostrar pantalla pre-sesión solo en arranques frescos con progresiones
  const [showPreSession, setShowPreSession] = useState(false)

  // Store subscriptions persist the final transition synchronously, before the
  // completion screen can submit or a navigation can interrupt a React effect.
  useEffect(() => useSessionStore.subscribe((state, previous) => {
    if (state.userId !== userId || state.workoutId !== workoutId || !state.clientSessionId) return
    if (state.exercises === previous.exercises && state.finishedAt === previous.finishedAt
      && state.clientSessionId === previous.clientSessionId && state.activationState === previous.activationState) return
    const snapshot: SessionSnapshot = {
      userId, clientSessionId: state.clientSessionId, workoutId,
      activationState: state.activationState,
      workoutName: state.workoutName, startedAt: state.startedAt,
      finishedAt: state.finishedAt, exercises: state.exercises,
    }
    latestBackupRef.current = snapshot
    const result = saveBackup(snapshot)
    onSyncEvent(syncEventForStorageResult('write', result), result.ok ? null : 'backup-write')
  }), [onSyncEvent, userId, workoutId])

  const prepareCurrentSession = useCallback(async (generation = sessionLifecycleRef.current.generation) => {
    if (!isCurrentSessionLifecycle(generation)) return
    const attempt = ++initializationAttemptRef.current
    setAuthorizationState('authorizing')
    setAuthorizationError(null)
    setReadinessStatus(null)
    setReadinessGeneration(0)
    setReadinessOpen(false)
    try {
      const state = useSessionStore.getState()
      if (state.userId !== userId || state.workoutId !== workoutId || !state.clientSessionId) {
        const backup = await recoverSessionBackup(userId, workoutId, verifySessionBackupOwner)
        if (!isCurrentSessionLifecycle(generation) || attempt !== initializationAttemptRef.current) return
        if (backup) {
          restoreSession(backup, prescriptionLocked)
          setShowPreSession(false)
        } else {
          initSession(workoutId, workoutName, exercises, prescriptionLocked, userId)
          setShowPreSession(!prescriptionLocked && extractProgressions(exercises).length > 0)
        }
      }
      await authorizeCurrentSession(generation)
    } catch {
      if (!isCurrentSessionLifecycle(generation) || attempt !== initializationAttemptRef.current) return
      setAuthorizationState('error')
      setAuthorizationError(t('No se pudo recuperar la sesión. Inténtalo nuevamente.'))
    }
  }, [authorizeCurrentSession, exercises, initSession, isCurrentSessionLifecycle, prescriptionLocked, restoreSession, t, userId, workoutId, workoutName])

  useEffect(() => {
    const generation = sessionLifecycleRef.current.generation + 1
    sessionLifecycleRef.current = { generation, active: true }
    void prepareCurrentSession(generation)
    return () => {
      if (sessionLifecycleRef.current.generation === generation) sessionLifecycleRef.current.active = false
      initializationAttemptRef.current += 1
      authorizationAttemptRef.current += 1
    }
  }, [prepareCurrentSession])

  // ── Conectar el ticker del rest timer ─────────────────────────────────────
  useRestTimer()

  // ── Wake lock: pantalla encendida durante el entrenamiento ────────────────
  useWakeLock(!isFinished)

  if (authorizationState !== 'ready') {
    const needsProfessional = readinessStatus === 'professional_clearance_required'
    const readinessDescription = t('Revisa tus respuestas antes de continuar con este entrenamiento.')
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4 py-6" aria-live="polite">
        <section className="w-full max-w-sm space-y-4 rounded-3xl border border-border/60 bg-card p-6 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
            {authorizationState === 'authorizing'
              ? <LoaderCircle className="h-6 w-6 animate-spin motion-reduce:animate-none" />
              : needsProfessional ? <ShieldAlert className="h-6 w-6" /> : <ClipboardCheck className="h-6 w-6" />}
          </span>
          {readinessStatus ? (
            <h1 className="font-display text-2xl font-bold leading-tight">
              {needsProfessional ? t('Necesitas autorización profesional') : t('Completa tu preparación')}
            </h1>
          ) : null}
          <p role={authorizationState === 'error' ? 'alert' : 'status'} className="text-sm leading-relaxed text-muted-foreground">
            {authorizationState === 'authorizing'
              ? t('Preparando sesión…')
              : needsProfessional
                ? t('Tus respuestas indican que necesitas autorización de un profesional de salud antes de comenzar. Revisa tus respuestas si tu situación ha cambiado.')
                : readinessStatus === 'pending' ? readinessDescription
                  : authorizationError ?? t('No se pudo preparar la sesión.')}
          </p>
          {authorizationState === 'error' && readinessStatus ? (
            <div className="grid gap-2">
              <button
                ref={readinessTriggerRef}
                type="button"
                onClick={() => setReadinessOpen(true)}
                className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {needsProfessional ? t('Revisar respuestas') : t('Completar preparación')}
              </button>
              <Link href="/plan" className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t('Volver al plan')}
              </Link>
            </div>
          ) : authorizationState === 'error' ? (
            <button
              type="button"
              onClick={() => void prepareCurrentSession()}
              className="min-h-[44px] rounded-md bg-violet-600 px-5 py-2 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              {t('Reintentar autorización')}
            </button>
          ) : null}
        </section>
        <ReadinessReviewDialog
          open={readinessOpen}
          onOpenChange={setReadinessOpen}
          title={t('Preparación antes de entrenar')}
          description={readinessDescription}
          submitLabel={t('Guardar y continuar')}
          onSaved={() => { void authorizeCurrentSession(readinessGeneration) }}
          onCloseAutoFocus={event => {
            event.preventDefault()
            readinessTriggerRef.current?.focus()
          }}
        />
      </main>
    )
  }

  // ── Pantalla pre-sesión (progresiones pendientes) ─────────────────────────
  if (showPreSession && progressions.length > 0) {
    return (
      <PreSessionScreen
        progressions={progressions}
        onApply={updates => {
          applyProgressions(updates)
          setShowPreSession(false)
        }}
        onSkip={() => setShowPreSession(false)}
      />
    )
  }

  // ── Pantalla de finalización ──────────────────────────────────────────────
  if (isFinished) {
    return (
      <CompletionScreen
        workoutId={workoutId}
        communityEnabled={communityEnabled}
        syncState={syncState}
        syncErrorSource={syncErrorSource}
        onSyncEvent={onSyncEvent}
        onRetryLocalBackup={retryLocalBackup}
        onEnsureBackup={retryLocalBackup}
        onClearBackup={() => clearBackup(userId, workoutId)}
      />
    )
  }

  return (
    <div data-marketing-capture="session" className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header sticky */}
      <div data-session-sync-state={syncState}>
        <SessionHeader
          onFinish={finishSession}
          syncState={syncState}
          onSyncRetry={syncErrorSource === 'backup-write' ? retryLocalBackup : undefined}
        />
      </div>

      {/* Lista de ejercicios con scroll */}
      <main aria-label={t('Sesión activa')} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg space-y-3 px-4 pb-48 pt-4">
          {storeExercises.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              {t('Este entrenamiento no tiene ejercicios configurados.')}
            </div>
          )}

          {storeExercises.map(exercise => (
            <ExerciseCard
              key={exercise.workoutExerciseId}
              exercise={exercise}
              exerciseOptions={exerciseOptions}
              focusWindow={exercise.status === 'active' ? focusWindow : undefined}
              prescriptionLocked={prescriptionLocked}
            />
          ))}

          {!prescriptionLocked && (
            <SessionRoutineTools exerciseOptions={exerciseOptions} />
          )}

          <div className="h-4" />
        </div>
      </main>
    </div>
  )
}
