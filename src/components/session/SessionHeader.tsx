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
import { useSessionStore } from '@/store/sessionStore'
import { SyncStatusIndicator } from '@/components/session/SyncStatusIndicator'

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
}

export function SessionHeader({ onFinish }: Props) {
  const router        = useRouter()
  const workoutName   = useSessionStore(s => s.workoutName)
  const startedAt     = useSessionStore(s => s.startedAt)
  const exercises     = useSessionStore(s => s.exercises)
  const elapsed       = useElapsedTime(startedAt)

  const [showExitDialog, setShowExitDialog] = useState(false)

  // Progreso: número de series completadas
  const completedSets = exercises.reduce(
    (acc, e) => acc + e.sets.filter(s => s.completed).length, 0,
  )
  const totalSets = exercises.reduce((acc, e) => acc + e.sets.length, 0)

  function handleBack() {
    if (completedSets > 0) {
      setShowExitDialog(true)
    } else {
      router.back()
    }
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-background/95 backdrop-blur-sm border-b border-border/40">
        {/* Botón atrás */}
        <button
          type="button"
          onClick={handleBack}
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          aria-label="Volver"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Nombre del workout + progreso */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{workoutName}</p>
          <div className="flex items-center gap-2">
            <p className={cn(
              'text-xs tabular-nums',
              elapsed > 0 ? 'text-indigo-400' : 'text-muted-foreground',
            )}>
              {formatTime(elapsed)}
            </p>
            {totalSets > 0 && (
              <span className="text-xs text-muted-foreground tabular-nums">
                · {completedSets}/{totalSets} series
              </span>
            )}
            <SyncStatusIndicator />
          </div>
        </div>

        {/* Botón finalizar */}
        <Button
          size="sm"
          variant="outline"
          onClick={onFinish}
          disabled={completedSets === 0}
          className={cn(
            'shrink-0 h-9 gap-1.5 transition-colors',
            completedSets > 0
              ? 'border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/50'
              : 'border-border/30 text-muted-foreground/40 cursor-not-allowed',
          )}
        >
          <Flag className="h-3.5 w-3.5" />
          Finalizar
        </Button>
      </header>

      {/* ── Diálogo de confirmación para salir ───────────────────────────── */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Salir del entrenamiento?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tienes {completedSets} {completedSets === 1 ? 'serie' : 'series'} completadas.
            Si sales ahora, el progreso no guardado se perderá.
          </p>
          <div className="flex gap-3 mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowExitDialog(false)}
            >
              Seguir entrenando
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => router.back()}
            >
              Salir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
