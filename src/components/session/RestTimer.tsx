'use client'

import { useEffect, useRef } from 'react'
import { X }               from 'lucide-react'
import { cn }              from '@/lib/utils'
import { hapticPattern }   from '@/lib/native/haptics'
import { useSessionStore } from '@/store/sessionStore'
import { useI18n } from '@/components/i18n/I18nProvider'

// ─── Formato mm:ss ────────────────────────────────────────────────────────────

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

// ─── RestTimer ────────────────────────────────────────────────────────────────

export function RestTimer({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n()
  const restTimer    = useSessionStore(s => s.restTimer)
  const extendTimer  = useSessionStore(s => s.extendRestTimer)
  const clearTimer   = useSessionStore(s => s.clearRestTimer)

  // Haptic en hitos clave del countdown (nativo: plugin; web: navigator.vibrate)
  useEffect(() => {
    if (!restTimer) return
    const { remainingSeconds } = restTimer
    if (remainingSeconds === 10 || remainingSeconds === 5) {
      void hapticPattern(80)
    } else if (remainingSeconds === 3) {
      void hapticPattern([80, 40, 80])
    }
  }, [restTimer?.remainingSeconds]) // eslint-disable-line react-hooks/exhaustive-deps

  // Haptic al terminar el descanso. Un ref evita disparar en el montaje inicial
  // (cuando restTimer ya es null) y solo reacciona a la transición activo → fin.
  const hadTimerRef = useRef(false)
  useEffect(() => {
    if (restTimer) {
      hadTimerRef.current = true
    } else if (hadTimerRef.current) {
      hadTimerRef.current = false
      void hapticPattern([100, 60, 100, 60, 150])
    }
  }, [restTimer])

  if (!restTimer) return null

  const { totalSeconds, remainingSeconds } = restTimer
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0
  const isLow    = remainingSeconds <= 10
  const radius   = 26
  const circ     = 2 * Math.PI * radius
  const dashOffset = circ * (1 - progress)

  return (
    <div className={cn(
      embedded
        ? 'w-full'
        : 'pointer-events-none fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 flex justify-center',
    )}>
      <div
        className={cn(
          'pointer-events-auto',
          'flex items-center gap-4 px-5 py-3.5 rounded-2xl shadow-xl',
          'border border-border/60 bg-background/95 backdrop-blur-md',
          'animate-in fade-in slide-in-from-bottom-4 duration-300 motion-reduce:animate-none',
          'transition-colors',
          embedded && 'w-full border-0 bg-transparent p-0 shadow-none backdrop-blur-none',
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
                isLow ? 'stroke-red-400' : 'stroke-violet-400',
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
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{t('Descanso activo')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => extendTimer(30)}
              className="min-h-[44px] flex-1 rounded-lg border border-border/60 bg-muted/20 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 motion-reduce:transition-none"
            >
              +30s
            </button>
            <button
              type="button"
              onClick={clearTimer}
              className="min-h-[44px] flex-1 rounded-lg border border-border/60 bg-muted/20 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 motion-reduce:transition-none"
            >
              {t('Saltar')}
            </button>
          </div>
        </div>

        {/* Cerrar */}
        <button
          type="button"
          onClick={clearTimer}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 motion-reduce:transition-none"
          aria-label={t('Cerrar timer')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
