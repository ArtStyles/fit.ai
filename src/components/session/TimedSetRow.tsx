'use client'

import { useEffect, useState } from 'react'
import { Check, Pause, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticImpact } from '@/lib/native/haptics'
import { RPESelector } from './RPESelector'
import type { SetData } from '@/store/sessionStore'
import { useI18n } from '@/components/i18n/I18nProvider'

interface Props {
  setNumber: number
  data: SetData
  targetSeconds: number
  onDurationChange: (seconds: number) => void
  onRpeChange: (rpe: number) => void
  onComplete: () => void
  isActive: boolean
  isCurrent: boolean
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`
}

export function TimedSetRow({
  setNumber,
  data,
  targetSeconds,
  onDurationChange,
  onRpeChange,
  onComplete,
  isActive,
  isCurrent,
}: Props) {
  const { t } = useI18n()
  const [remaining, setRemaining] = useState(targetSeconds)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!running || data.completed) return
    const timer = window.setInterval(() => {
      setRemaining(value => {
        if (value <= 1) {
          window.clearInterval(timer)
          setRunning(false)
          onDurationChange(targetSeconds)
          void hapticImpact('medium')
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [data.completed, onDurationChange, running, targetSeconds])

  function complete() {
    const elapsed = Math.max(1, targetSeconds - remaining)
    onDurationChange(remaining === 0 ? targetSeconds : elapsed)
    setRunning(false)
    void hapticImpact('medium')
    onComplete()
  }

  return (
    <div className={cn(
      'grid min-h-[44px] grid-cols-[28px_1fr_48px] items-center gap-1.5 rounded-lg px-1 py-2 sm:grid-cols-[28px_1fr_112px_48px]',
      data.completed ? 'bg-green-500/5' : isActive ? 'bg-muted/10' : '',
      isCurrent && isActive && !data.completed ? 'bg-violet-500/10 ring-1 ring-inset ring-violet-400/30' : '',
    )} aria-current={isCurrent ? 'step' : undefined}>
      <span className={cn('text-center text-xs font-semibold', data.completed ? 'text-green-400' : 'text-muted-foreground')}>
        {setNumber}{isCurrent && !data.completed ? <span className="sr-only"> {t('Serie actual')}</span> : null}
      </span>
      <div className="flex min-h-11 flex-col items-center justify-between rounded-lg border border-border/60 bg-background/80 px-2 py-1 sm:flex-row sm:py-0">
        <span className="text-[10px] font-semibold text-muted-foreground sm:hidden">{t('Tiempo')}</span>
        <span className="font-mono text-sm tabular-nums">{formatDuration(remaining)}</span>
        <div className="flex gap-1">
          <button type="button" disabled={!isActive || data.completed}
            aria-label={running ? t('Pausar temporizador') : t('Iniciar temporizador')}
            onClick={() => setRunning(value => !value)}
            className="min-h-[44px] min-w-[44px] rounded-md p-1.5 text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-30">
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button type="button" disabled={!isActive || data.completed}
            aria-label={t('Reiniciar temporizador')}
            onClick={() => { setRunning(false); setRemaining(targetSeconds); onDurationChange(0) }}
            className="min-h-[44px] min-w-[44px] rounded-md p-1.5 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-30">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="col-start-2 row-start-2 flex justify-center sm:col-start-auto sm:row-start-auto">
        <span className="mr-2 self-center text-xs font-semibold text-muted-foreground sm:hidden">{t('RPE')}</span>
        <RPESelector value={data.rpe} onChange={onRpeChange} disabled={!isActive || data.completed} />
      </div>
      <button type="button" onClick={complete} disabled={!isActive || data.completed}
        aria-label={data.completed ? t('Intervalo completado') : t('Completar intervalo')}
        className={cn('col-start-3 row-span-2 row-start-1 flex h-11 w-11 self-center items-center justify-center rounded-full border-2 sm:col-start-auto sm:row-span-1 sm:row-start-auto',
          data.completed ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-border/60 text-muted-foreground',
          !isActive && !data.completed ? 'opacity-30' : '')}>
        {data.completed ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
      </button>
    </div>
  )
}

