'use client'

import { useEffect }       from 'react'
import { X }               from 'lucide-react'
import { cn }              from '@/lib/utils'
import { useSessionStore } from '@/store/sessionStore'

// ─── Formato mm:ss ────────────────────────────────────────────────────────────

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ─── RestTimer ────────────────────────────────────────────────────────────────

export function RestTimer() {
  const restTimer    = useSessionStore(s => s.restTimer)
  const extendTimer  = useSessionStore(s => s.extendRestTimer)
  const clearTimer   = useSessionStore(s => s.clearRestTimer)

  // Vibración en hitos clave del countdown
  useEffect(() => {
    if (!restTimer || !('vibrate' in navigator)) return
    const { remainingSeconds } = restTimer
    if (remainingSeconds === 10 || remainingSeconds === 5) {
      navigator.vibrate(80)
    } else if (remainingSeconds === 3) {
      navigator.vibrate([80, 40, 80])
    }
  }, [restTimer?.remainingSeconds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Vibración al terminar (timer desaparece → remainingSeconds llegó a 0)
  useEffect(() => {
    if (!restTimer && 'vibrate' in navigator) {
      navigator.vibrate([100, 60, 100, 60, 150])
    }
  // Solo disparar cuando el timer pasa de existir a null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restTimer === null])

  if (!restTimer) return null

  const { totalSeconds, remainingSeconds } = restTimer
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0
  const isLow    = remainingSeconds <= 10
  const radius   = 26
  const circ     = 2 * Math.PI * radius
  const dashOffset = circ * (1 - progress)

  return (
    <div className="fixed bottom-6 inset-x-4 z-30 pointer-events-none flex justify-center">
      <div
        className={cn(
          'pointer-events-auto',
          'flex items-center gap-4 px-5 py-3.5 rounded-2xl shadow-xl',
          'border border-border/60 bg-background/95 backdrop-blur-md',
          'animate-in fade-in slide-in-from-bottom-4 duration-300',
          'transition-colors',
          isLow && 'border-red-500/50 bg-red-500/10 shadow-[0_0_28px_rgba(239,68,68,0.4)]',
        )}
      >
        {/* Progreso circular */}
        <div className="relative h-14 w-14 shrink-0">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 60 60">
            {/* Track */}
            <circle
              cx="30" cy="30" r={radius}
              fill="none"
              strokeWidth="3"
              className="stroke-muted/30"
            />
            {/* Progreso */}
            <circle
              cx="30" cy="30" r={radius}
              fill="none"
              strokeWidth="3"
              strokeDasharray={circ}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              className={cn(
                'transition-all',
                isLow ? 'stroke-red-400' : 'stroke-indigo-400',
              )}
            />
          </svg>
          {/* Tiempo centrado */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={cn(
              'font-display text-lg font-bold tabular-nums',
              isLow ? 'text-red-400' : 'text-foreground',
            )}>
              {fmt(remainingSeconds)}
            </span>
          </div>
        </div>

        {/* Texto + botones */}
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Descanso activo</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => extendTimer(30)}
              className="flex-1 h-11 rounded-lg border border-border/60 bg-muted/20 text-sm font-semibold text-foreground hover:bg-muted/40 transition-colors"
            >
              +30s
            </button>
            <button
              type="button"
              onClick={clearTimer}
              className="flex-1 h-11 rounded-lg border border-border/60 bg-muted/20 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              Saltar
            </button>
          </div>
        </div>

        {/* Cerrar */}
        <button
          type="button"
          onClick={clearTimer}
          className="shrink-0 h-10 w-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Cerrar timer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
