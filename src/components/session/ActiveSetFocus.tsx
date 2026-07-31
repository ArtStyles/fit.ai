'use client'

import { useEffect, useState } from 'react'
import { Minus, Pause, Play, Plus, RotateCcw } from 'lucide-react'

import { useI18n } from '@/components/i18n/I18nProvider'
import { hapticImpact } from '@/lib/native/haptics'
import { cn } from '@/lib/utils'
import { useSessionStore, type SetData } from '@/store/sessionStore'
import { RPESelector } from './RPESelector'
import { setInputMode, stepSessionValue } from './sessionViewModel'

type ActiveSetFocusProps = {
  exerciseId: string
  setIndex: number
  data: SetData
  targetDuration: number | null
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds))
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

function StepControl({
  label,
  ariaLabel,
  value,
  unit,
  inputMode,
  step,
  precision,
  onChange,
}: {
  label: string
  ariaLabel: string
  value: string
  unit: string
  inputMode: 'numeric' | 'decimal'
  step: number
  precision: number
  onChange: (value: string) => void
}) {
  function move(delta: number) {
    void hapticImpact('light')
    onChange(stepSessionValue(value, delta, precision))
  }

  return (
    <div>
      <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2">
        <button type="button" onClick={() => move(-step)} aria-label={`${label} −`} className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-[hsl(var(--surface-2))] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><Minus className="h-5 w-5" aria-hidden="true" /></button>
        <label className="relative min-w-0">
          <span className="sr-only">{label}</span>
          <input
            aria-label={ariaLabel}
            type="number"
            inputMode={inputMode}
            min="0"
            step={step}
            value={value}
            onChange={event => onChange(event.target.value)}
            className="h-16 w-full rounded-2xl border border-violet-400/30 bg-background text-center font-display text-3xl font-extrabold tabular-nums text-foreground outline-none focus:ring-2 focus:ring-violet-400"
          />
          <span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{unit}</span>
        </label>
        <button type="button" onClick={() => move(step)} aria-label={`${label} +`} className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-[hsl(var(--surface-2))] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><Plus className="h-5 w-5" aria-hidden="true" /></button>
      </div>
    </div>
  )
}

export function ActiveSetFocus({ exerciseId, setIndex, data, targetDuration }: ActiveSetFocusProps) {
  const { t } = useI18n()
  const updateSetField = useSessionStore(state => state.updateSetField)
  const updateSetDuration = useSessionStore(state => state.updateSetDuration)
  const selectRpe = useSessionStore(state => state.selectRpe)
  const [remaining, setRemaining] = useState(targetDuration ?? 0)
  const [running, setRunning] = useState(false)

  useEffect(() => {
    setRemaining(targetDuration ?? 0)
    setRunning(false)
  }, [exerciseId, setIndex, targetDuration])

  useEffect(() => {
    if (!running || !targetDuration) return
    const timer = window.setInterval(() => {
      setRemaining(value => {
        if (value <= 1) {
          window.clearInterval(timer)
          setRunning(false)
          updateSetDuration(exerciseId, setIndex, targetDuration)
          void hapticImpact('medium')
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [exerciseId, running, setIndex, targetDuration, updateSetDuration])

  return (
    <div role="group" aria-label={t('Serie actual')} className="rounded-3xl border border-violet-400/30 bg-gradient-to-b from-violet-500/10 to-[hsl(var(--surface-1))] p-5 shadow-xl shadow-violet-950/15">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{t('Serie actual')}</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">{t('Serie {number}', { number: setIndex + 1 })}</p>
        </div>
        <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-200">RPE {data.rpe ?? '—'}</span>
      </div>

      {targetDuration ? (
        <div className="rounded-2xl border border-border/60 bg-background/60 p-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{t('Tiempo')}</p>
          <p className={cn('mt-3 font-display text-5xl font-extrabold tabular-nums', remaining <= 10 ? 'text-[hsl(var(--training-warning))]' : 'text-foreground')}>{formatDuration(remaining)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setRunning(value => !value)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-500 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
              {running ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              {running ? t('Pausar') : t('Iniciar')}
            </button>
            <button type="button" onClick={() => { setRunning(false); setRemaining(targetDuration); updateSetDuration(exerciseId, setIndex, 0) }} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"><RotateCcw className="h-4 w-4" aria-hidden="true" />{t('Reiniciar')}</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <StepControl
            label={t('Peso en kilogramos')}
            ariaLabel={t('Peso en kilogramos')}
            value={data.weightKg}
            unit={t('kg')}
            inputMode={setInputMode('weight')}
            step={0.5}
            precision={1}
            onChange={value => updateSetField(exerciseId, setIndex, 'weightKg', value)}
          />
          <StepControl
            label={t('Repeticiones')}
            ariaLabel={t('Repeticiones')}
            value={data.reps}
            unit={t('reps')}
            inputMode={setInputMode('reps')}
            step={1}
            precision={0}
            onChange={value => updateSetField(exerciseId, setIndex, 'reps', value)}
          />
        </div>
      )}

      <div className="mt-5 border-t border-border/60 pt-4">
        <p className="mb-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t('Esfuerzo percibido')}</p>
        <div className="flex justify-center"><RPESelector value={data.rpe} onChange={rpe => selectRpe(exerciseId, setIndex, rpe)} /></div>
      </div>
    </div>
  )
}
