'use client'

import { Check } from 'lucide-react'

import { useI18n } from '@/components/i18n/I18nProvider'
import { hapticImpact } from '@/lib/native/haptics'
import { useSessionStore } from '@/store/sessionStore'
import { RestTimer } from './RestTimer'

type Props = {
  exerciseId: string
  setIndex: number
  onComplete: () => void
}

export function CompleteSetDock({ exerciseId, setIndex, onComplete }: Props) {
  const { t } = useI18n()
  const restTimer = useSessionStore(state => state.restTimer)

  return (
    <div data-exercise-id={exerciseId} className="fitai-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 p-4 backdrop-blur-xl">
      <div className="mx-auto max-w-lg">
        <RestTimer embedded />
        {!restTimer && (
          <button
            type="button"
            onClick={() => { void hapticImpact('medium'); onComplete() }}
            className="min-h-14 w-full rounded-2xl bg-[hsl(var(--training-action))] px-5 text-base font-extrabold text-slate-950 shadow-lg shadow-lime-950/20 transition-[filter,transform] duration-[var(--motion-press)] hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--training-action))] motion-reduce:transition-none"
          >
            <span className="inline-flex items-center gap-2"><Check className="h-5 w-5" aria-hidden="true" />{t('Completar serie {number}', { number: setIndex + 1 })}</span>
          </button>
        )}
      </div>
    </div>
  )
}
