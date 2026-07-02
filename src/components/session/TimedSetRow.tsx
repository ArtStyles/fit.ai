'use client'

import { useEffect, useState } from 'react'
import { Check, Pause, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hapticImpact } from '@/lib/native/haptics'
import { RPESelector } from './RPESelector'
import type { SetData } from '@/store/sessionStore'

interface Props {
  setNumber: number
  data: SetData
  targetSeconds: number
  onDurationChange: (seconds: number) => void
  onRpeChange: (rpe: number) => void
  onComplete: () => void
  isActive: boolean
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
}: Props) {
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
      'grid grid-cols-[28px_1fr_64px_48px] items-center gap-1.5 rounded-lg px-1 py-2',
      data.completed ? 'bg-green-500/5' : isActive ? 'bg-muted/10' : '',
    )}>
      <span className={cn('text-center text-xs font-semibold', data.completed ? 'text-green-400' : 'text-muted-foreground')}>
        {setNumber}
      </span>
      <div className="flex h-11 items-center justify-between rounded-lg border border-border/60 bg-background/80 px-2">
        <span className="font-mono text-sm tabular-nums">{formatDuration(remaining)}</span>
        <div className="flex gap-1">
          <button type="button" disabled={!isActive || data.completed}
            aria-label={running ? 'Pausar temporizador' : 'Iniciar temporizador'}
            onClick={() => setRunning(value => !value)}
            className="rounded-md p-1.5 text-indigo-300 disabled:opacity-30">
            {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button type="button" disabled={!isActive || data.completed}
            aria-label="Reiniciar temporizador"
            onClick={() => { setRunning(false); setRemaining(targetSeconds); onDurationChange(0) }}
            className="rounded-md p-1.5 text-muted-foreground disabled:opacity-30">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
      <RPESelector value={data.rpe} onChange={onRpeChange} disabled={!isActive || data.completed} />
      <button type="button" onClick={complete} disabled={!isActive || data.completed}
        aria-label={data.completed ? 'Intervalo completado' : 'Completar intervalo'}
        className={cn('flex h-11 w-11 items-center justify-center rounded-full border-2',
          data.completed ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-border/60 text-muted-foreground',
          !isActive && !data.completed ? 'opacity-30' : '')}>
        {data.completed ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
      </button>
    </div>
  )
}

