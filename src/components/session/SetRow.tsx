'use client'

import { Check } from 'lucide-react'
import { cn }    from '@/lib/utils'
import { hapticImpact } from '@/lib/native/haptics'
import { RPESelector } from './RPESelector'
import { setInputMode } from './sessionViewModel'
import type { SetData } from '@/store/sessionStore'
import { useI18n } from '@/components/i18n/I18nProvider'

interface Props {
  setNumber: number
  data:      SetData
  onWeightChange: (v: string) => void
  onRepsChange:   (v: string) => void
  onRpeChange:    (rpe: number) => void
  onComplete:     () => void
  isActive:       boolean   // ejercicio activo = inputs habilitados
  isCurrent:      boolean
}

export function SetRow({
  setNumber, data,
  onWeightChange, onRepsChange, onRpeChange, onComplete,
  isActive, isCurrent,
}: Props) {
  const { t } = useI18n()
  const { weightKg, reps, rpe, completed } = data

  return (
    <div className={cn(
      'grid min-h-[44px] items-center gap-1.5 py-2 px-1 rounded-lg transition-colors motion-reduce:transition-none',
      'grid-cols-[28px_1fr_1fr_48px] sm:grid-cols-[28px_1fr_1fr_112px_48px]',
      completed && 'bg-green-500/5',
      !completed && isActive && 'bg-muted/10',
      isCurrent && isActive && !completed && 'bg-violet-500/10 ring-1 ring-inset ring-violet-400/30',
    )} aria-current={isCurrent ? 'step' : undefined}>
      {/* Número de serie */}
      <span className={cn('text-center text-xs font-semibold tabular-nums', completed ? 'text-green-400' : isCurrent ? 'text-violet-200' : 'text-muted-foreground')}>
        {setNumber}
        {isCurrent && !completed ? <span className="sr-only"> {t('Serie actual')}</span> : null}
      </span>

      {/* Peso (kg) */}
      <label className="relative block min-w-0">
        <span className="sr-only">{t('Peso en kilogramos')}</span>
        <input
          aria-label={t('Peso en kilogramos')}
          type="number"
          inputMode={setInputMode('weight')}
          step="0.1"
          min="0"
          value={weightKg}
          onChange={e => onWeightChange(e.target.value)}
          disabled={!isActive || completed}
          className={cn(
            'h-11 w-full rounded-lg border border-border/60 bg-background/80',
            'pl-1 pr-6 text-center text-base font-medium tabular-nums',
            'focus:outline-none focus:ring-2 focus:ring-violet-500/80',
            'disabled:cursor-default disabled:opacity-40',
            completed && 'border-green-500/30 text-green-300',
          )}
        />
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{t('kg')}</span>
      </label>

      {/* Reps */}
      <label className="relative block min-w-0">
        <span className="sr-only">{t('Repeticiones')}</span>
        <input
          aria-label={t('Repeticiones')}
          type="number"
          inputMode={setInputMode('reps')}
          min="0"
          value={reps}
          onChange={e => onRepsChange(e.target.value)}
          disabled={!isActive || completed}
          className={cn(
            'h-11 w-full rounded-lg border border-border/60 bg-background/80',
            'pl-1 pr-8 text-center text-base font-medium tabular-nums',
            'focus:outline-none focus:ring-2 focus:ring-violet-500/80',
            'disabled:cursor-default disabled:opacity-40',
            completed && 'border-green-500/30 text-green-300',
          )}
        />
        <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground">{t('reps')}</span>
      </label>

      {/* RPE */}
      <div className="col-span-2 col-start-2 row-start-2 flex justify-center sm:col-span-1 sm:col-start-auto sm:row-start-auto">
        <span className="mr-2 self-center text-xs font-semibold text-muted-foreground sm:hidden">{t('RPE')}</span>
        <RPESelector
          value={rpe}
          onChange={onRpeChange}
          disabled={!isActive || completed}
        />
      </div>

      {/* Botón completar */}
      <button
        type="button"
        onClick={() => { void hapticImpact('medium'); onComplete() }}
        disabled={!isActive || completed}
        aria-label={completed ? t('Serie completada') : t('Completar serie')}
        className={cn(
          'col-start-4 row-span-2 row-start-1 h-11 w-11 self-center rounded-full border-2 flex items-center justify-center sm:col-start-auto sm:row-span-1 sm:row-start-auto',
          'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 motion-reduce:transition-none',
          completed
            ? 'border-green-500 bg-green-500/10 text-green-400 cursor-default shadow-[0_0_12px_rgba(34,197,94,0.45)]'
            : 'border-border/60 text-muted-foreground hover:border-violet-500 hover:text-violet-300',
          (!isActive && !completed) && 'opacity-30 cursor-default',
        )}
      >
        {completed && <Check className="h-4 w-4" strokeWidth={3} />}
      </button>
    </div>
  )
}
