'use client'

import { useState }        from 'react'
import { ArrowLeft, Flag } from 'lucide-react'
import { useRouter }       from 'next/navigation'
import { useEffect }       from 'react'
import { cn }              from '@/lib/utils'
import { Button }          from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { canFinishSession, useSessionStore } from '@/store/sessionStore'
import { SessionSyncStatus } from '@/components/session/SessionSyncStatus'
import type { SessionSyncState } from '@/components/session/sessionViewModel'
import { useBackHandler } from '@/lib/native/backHandlers'
import { useI18n } from '@/components/i18n/I18nProvider'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'

// ─── Elapsed timer ────────────────────────────────────────────────────────────

function useElapsedTime(startedAt: number) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startedAt) return
    const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  return elapsed
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ─── SessionHeader ────────────────────────────────────────────────────────────

interface Props {
  onFinish: () => void
  syncState: SessionSyncState
  onSyncRetry?: () => void
}

export function SessionHeader({ onFinish, syncState, onSyncRetry }: Props) {
  const { t } = useI18n()
  const router        = useRouter()
  const workoutName   = useSessionStore(s => s.workoutName)
  const startedAt     = useSessionStore(s => s.startedAt)
  const exercises     = useSessionStore(s => s.exercises)
  const prescriptionLocked = useSessionStore(s => s.prescriptionLocked)
  const elapsed       = useElapsedTime(startedAt)

  const [showExitDialog, setShowExitDialog] = useState(false)

  // Progreso: número de series completadas
  const completedSets = exercises.reduce(
    (acc, e) => acc + e.sets.filter(s => s.completed).length, 0,
  )
  const totalSets = exercises.reduce((acc, e) => acc + e.sets.length, 0)
  const canFinish = canFinishSession(exercises, prescriptionLocked)

  // Gesto/botón atrás de Android: cerrar el diálogo si está abierto, o pedir
  // confirmación antes de abandonar un entreno con progreso (igual que el botón).
  useBackHandler(() => {
    if (showExitDialog) {
      setShowExitDialog(false)
      return true
    }
    if (completedSets > 0) {
      setShowExitDialog(true)
      return true
    }
    return false
  })

  function handleBack() {
    if (completedSets > 0) {
      setShowExitDialog(true)
    } else {
      router.back()
    }
  }

  return (
    <>
      <FixedTopBar className="bg-background/95" contentClassName="block max-w-lg p-0" initialHeight={73}>
        <div className="flex items-center gap-3 px-4 py-3">
        {/* Botón atrás */}
        <button
          type="button"
          onClick={handleBack}
          className="shrink-0 h-11 w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          aria-label={t('Volver')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Nombre del workout + progreso */}
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-foreground truncate">{workoutName}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className={cn(
              'font-display text-base font-bold leading-none tabular-nums',
              elapsed > 0 ? 'text-violet-300' : 'text-muted-foreground',
            )}>
              {formatTime(elapsed)}
            </p>
            {totalSets > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                · {completedSets}/{totalSets} {t('series')}
              </span>
            )}
            <SessionSyncStatus state={syncState} onRetry={onSyncRetry} className="mt-1 basis-full" />
          </div>
        </div>

        {/* Botón finalizar */}
        <Button
          size="sm"
          variant="outline"
          onClick={onFinish}
          disabled={!canFinish}
          className={cn(
            'shrink-0 h-11 gap-1.5 transition-colors',
            canFinish
              ? 'border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50'
              : 'border-border/30 text-muted-foreground/40 cursor-not-allowed',
          )}
        >
          <Flag className="h-3.5 w-3.5" />
          {t('Finalizar')}
        </Button>
        </div>

        {/* Barra de progreso de sesión */}
        {totalSets > 0 && (
          <div className="h-1 bg-muted/20">
            <div
              className="h-full rounded-r-full bg-[hsl(var(--training-active))] shadow-[0_0_8px_hsl(var(--training-active)/0.45)] transition-[width] duration-[var(--motion-progress)] ease-out motion-reduce:transition-none"
              style={{ width: `${Math.round((completedSets / totalSets) * 100)}%` }}
            />
          </div>
        )}
      </FixedTopBar>

      {/* ── Diálogo de confirmación para salir ───────────────────────────── */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('¿Salir del entrenamiento?')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('Tienes {count} {sets} completadas. Si sales ahora, el progreso no guardado se perderá.', {
              count: completedSets,
              sets: t(completedSets === 1 ? 'serie' : 'series'),
            })}
          </p>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowExitDialog(false)}
            >
              {t('Seguir entrenando')}
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => router.back()}
            >
              {t('Salir')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
