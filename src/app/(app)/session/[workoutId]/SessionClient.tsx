'use client'

import { useEffect, useRef }  from 'react'
import { useSessionStore }    from '@/store/sessionStore'
import { useRestTimer }       from '@/hooks/useRestTimer'
import { useWakeLock }        from '@/hooks/useWakeLock'
import { SessionHeader }      from '@/components/session/SessionHeader'
import { ExerciseCard }       from '@/components/session/ExerciseCard'
import { RestTimer }          from '@/components/session/RestTimer'
import { CompletionScreen }   from '@/components/session/CompletionScreen'
import { saveBackup, loadBackup, clearBackup } from '@/lib/session/persistSession'
import type { ExerciseSession } from '@/store/sessionStore'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  workoutId:        string
  workoutName:      string
  estimatedMinutes: number | null
  exercises:        ExerciseSession[]   // estado inicial del servidor
}

// ─── SessionClient ────────────────────────────────────────────────────────────

export function SessionClient({ workoutId, workoutName, exercises }: Props) {
  const initSession     = useSessionStore(s => s.initSession)
  const restoreSession  = useSessionStore(s => s.restoreSession)
  const finishSession   = useSessionStore(s => s.finishSession)
  const isFinished      = useSessionStore(s => s.isFinished)
  const storeExercises  = useSessionStore(s => s.exercises)
  const storeWorkoutId  = useSessionStore(s => s.workoutId)
  const startedAt       = useSessionStore(s => s.startedAt)
  const workoutNameStore = useSessionStore(s => s.workoutName)

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

    saveBackup({
      workoutId:   storeWorkoutId,
      workoutName: workoutNameStore,
      startedAt,
      exercises:   storeExercises,
    })
  }, [storeExercises, isFinished, storeWorkoutId, workoutId, workoutNameStore, startedAt])

  // ── Conectar el ticker del rest timer ─────────────────────────────────────
  useRestTimer()

  // ── Wake lock: pantalla encendida durante el entrenamiento ────────────────
  useWakeLock(!isFinished)

  // ── Pantalla de finalización ──────────────────────────────────────────────
  if (isFinished) {
    return <CompletionScreen workoutId={workoutId} onClearBackup={() => clearBackup(workoutId)} />
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background">
      {/* Header sticky */}
      <SessionHeader onFinish={finishSession} />

      {/* Lista de ejercicios con scroll */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-4 pb-40 space-y-3">
          {storeExercises.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              Este workout no tiene ejercicios configurados.
            </div>
          )}

          {storeExercises.map(exercise => (
            <ExerciseCard
              key={exercise.workoutExerciseId}
              exercise={exercise}
            />
          ))}

          <div className="h-4" />
        </div>
      </main>

      {/* Rest timer flotante */}
      <RestTimer />
    </div>
  )
}
