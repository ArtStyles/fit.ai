'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionStore }    from '@/store/sessionStore'
import { useRestTimer }       from '@/hooks/useRestTimer'
import { useWakeLock }        from '@/hooks/useWakeLock'
import { SessionHeader }      from '@/components/session/SessionHeader'
import { ExerciseCard }       from '@/components/session/ExerciseCard'
import { CompletionScreen }   from '@/components/session/CompletionScreen'
import { SessionRoutineTools } from '@/components/session/SessionRoutineTools'
import { PreSessionScreen }   from '@/components/session/PreSessionScreen'
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
import { saveBackup, loadBackup, clearBackup } from '@/lib/session/persistSession'
import type { ExerciseSession, SessionExerciseDraft } from '@/store/sessionStore'
import type { SessionSnapshot } from '@/lib/session/persistSession'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  workoutId:        string
  workoutName:      string
  estimatedMinutes: number | null
  exercises:        ExerciseSession[]   // estado inicial del servidor
  exerciseOptions:  SessionExerciseDraft[]
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

export function SessionClient({ workoutId, workoutName, exercises, exerciseOptions }: Props) {
  const { t } = useI18n()
  const initSession       = useSessionStore(s => s.initSession)
  const restoreSession    = useSessionStore(s => s.restoreSession)
  const applyProgressions = useSessionStore(s => s.applyProgressions)
  const finishSession     = useSessionStore(s => s.finishSession)
  const isFinished        = useSessionStore(s => s.isFinished)
  const storeExercises    = useSessionStore(s => s.exercises)
  const storeWorkoutId    = useSessionStore(s => s.workoutId)
  const startedAt         = useSessionStore(s => s.startedAt)
  const workoutNameStore  = useSessionStore(s => s.workoutName)
  const clientSessionId   = useSessionStore(s => s.clientSessionId)
  const [syncState, setSyncState] = useState<SessionSyncState>('syncing')
  const [syncErrorSource, setSyncErrorSource] = useState<SessionSyncErrorSource>(null)
  const focusWindow = buildSessionFocusWindow(storeExercises)
  const latestBackupRef = useRef<SessionSnapshot | null>(null)
  const onSyncEvent = useCallback((event: SessionSyncEvent, source: SessionSyncErrorSource = null) => {
    setSyncState(current => nextSessionSyncState(current, event))
    setSyncErrorSource(event === 'local-error' || event === 'server-error' ? source : null)
  }, [])
  const retryLocalBackup = useCallback(() => {
    const snapshot = latestBackupRef.current
    if (!snapshot) return
    onSyncEvent('retry')
    const result = saveBackup(snapshot)
    onSyncEvent(syncEventForStorageResult('write', result), result.ok ? null : 'backup-write')
  }, [onSyncEvent])

  // Pre-calcular progresiones desde la prop del servidor (antes de hidratación)
  const progressions = extractProgressions(exercises)

  // Mostrar pantalla pre-sesión solo en arranques frescos con progresiones
  const [showPreSession, setShowPreSession] = useState(() => {
    if (typeof window === 'undefined' || progressions.length === 0) return false
    return !loadBackup(workoutId)
  })

  // Evitar guardar el backup durante la hidratación inicial
  const initializedRef = useRef(false)

  // ── Inicializar / restaurar sesión ────────────────────────────────────────
  useEffect(() => {
    // Si el store ya tiene esta sesión activa (p.ej. hot-reload) no reiniciar
    if (storeWorkoutId === workoutId && storeExercises.length > 0) {
      initializedRef.current = true
      return
    }

    // Intentar restaurar desde localStorage (crash recovery)
    const backup = loadBackup(workoutId)
    if (backup) {
      restoreSession(backup)
    } else {
      initSession(workoutId, workoutName, exercises)
    }

    initializedRef.current = true
  // Solo al montar — workoutId no cambia en esta página
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId])

  // ── Backup automático en localStorage después de cada cambio de estado ────
  useEffect(() => {
    if (!initializedRef.current) return
    if (!storeWorkoutId || storeWorkoutId !== workoutId) return
    if (isFinished) return   // no sobrescribir backup después de finalizar

    const snapshot = {
      clientSessionId,
      workoutId:   storeWorkoutId,
      workoutName: workoutNameStore,
      startedAt,
      exercises:   storeExercises,
    }
    latestBackupRef.current = snapshot
    const result = saveBackup(snapshot)
    onSyncEvent(syncEventForStorageResult('write', result), result.ok ? null : 'backup-write')
  }, [clientSessionId, storeExercises, isFinished, onSyncEvent, storeWorkoutId, workoutId, workoutNameStore, startedAt])

  // ── Conectar el ticker del rest timer ─────────────────────────────────────
  useRestTimer()

  // ── Wake lock: pantalla encendida durante el entrenamiento ────────────────
  useWakeLock(!isFinished)

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
        syncState={syncState}
        syncErrorSource={syncErrorSource}
        onSyncEvent={onSyncEvent}
        onRetryLocalBackup={retryLocalBackup}
        onClearBackup={() => clearBackup(workoutId)}
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
            />
          ))}

          <SessionRoutineTools exerciseOptions={exerciseOptions} />

          <div className="h-4" />
        </div>
      </main>
    </div>
  )
}
