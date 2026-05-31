'use client'

import { Check } from 'lucide-react'
import { cn }    from '@/lib/utils'
import { RPESelector } from './RPESelector'
import type { SetData } from '@/store/sessionStore'

interface Props {
  setNumber: number
  data:      SetData
  onWeightChange: (v: string) => void
  onRepsChange:   (v: string) => void
  onRpeChange:    (rpe: number) => void
  onComplete:     () => void
  isActive:       boolean   // ejercicio activo = inputs habilitados
}

export function SetRow({
  setNumber, data,
  onWeightChange, onRepsChange, onRpeChange, onComplete,
  isActive,
}: Props) {
  const { weightKg, reps, rpe, completed } = data

  return (
    <div className={cn(
      'grid items-center gap-1.5 py-2 px-1 rounded-lg transition-colors',
      'grid-cols-[28px_1fr_1fr_64px_48px]',
      completed && 'bg-green-500/5',
      !completed && isActive && 'bg-muted/10',
    )}>
      {/* Número de serie */}
      <span className={cn(
        'text-center text-xs font-semibold tabular-nums',
        completed ? 'text-green-400' : 'text-muted-foreground',
      )}>
        {setNumber}
      </span>

      {/* Peso (kg) */}
      <input
        type="number"
        inputMode="decimal"
        step="2.5"
        min="0"
        placeholder="kg"
        value={weightKg}
        onChange={e => onWeightChange(e.target.value)}
        disabled={!isActive || completed}
        className={cn(
          'h-11 w-full rounded-lg border border-border/60 bg-background/80',
          'px-2 text-center text-sm font-medium tabular-nums',
          'placeholder:text-muted-foreground/40',
          'focus:outline-none focus:ring-1 focus:ring-indigo-500',
          'disabled:opacity-40 disabled:cursor-default',
          completed && 'border-green-500/30 text-green-300',
        )}
      />

      {/* Reps */}
      <input
        type="number"
        inputMode="numeric"
        min="0"
        placeholder="reps"
        value={reps}
        onChange={e => onRepsChange(e.target.value)}
        disabled={!isActive || completed}
        className={cn(
          'h-11 w-full rounded-lg border border-border/60 bg-background/80',
          'px-2 text-center text-sm font-medium tabular-nums',
          'placeholder:text-muted-foreground/40',
          'focus:outline-none focus:ring-1 focus:ring-indigo-500',
          'disabled:opacity-40 disabled:cursor-default',
          completed && 'border-green-500/30 text-green-300',
        )}
      />

      {/* RPE */}
      <RPESelector
        value={rpe}
        onChange={onRpeChange}
        disabled={!isActive || completed}
      />

      {/* Botón completar */}
      <button
        type="button"
        onClick={onComplete}
        disabled={!isActive || completed}
        aria-label={completed ? 'Serie completada' : 'Completar serie'}
        className={cn(
          'h-11 w-11 rounded-full border-2 flex items-center justify-center',
          'transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
          completed
            ? 'border-green-500 bg-green-500/10 text-green-400 cursor-default'
            : 'border-border/60 text-muted-foreground hover:border-indigo-500 hover:text-indigo-400',
          (!isActive && !completed) && 'opacity-30 cursor-default',
        )}
      >
        {completed && <Check className="h-4 w-4" strokeWidth={3} />}
      </button>
    </div>
  )
}
