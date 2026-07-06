'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OnboardingAnswers } from '@/app/onboarding/types'

export type AnswerUpdate = <K extends keyof OnboardingAnswers>(
  key: K,
  value: OnboardingAnswers[K],
) => void

export interface OnboardingStageProps {
  answers: OnboardingAnswers
  update: AnswerUpdate
  current: number
  total: number
  onBack: () => void
  onNext: () => void
}

interface StageShellProps {
  title: string
  description: string
  current: number
  total: number
  onBack: (() => void) | null
  onNext: () => void
  canContinue: boolean
  children: ReactNode
  nextLabel?: string
  nextBusy?: boolean
  nextVariant?: 'primary' | 'secondary'
  secondaryAction?: ReactNode
}

export function StageShell({
  title,
  description,
  current,
  total,
  onBack,
  onNext,
  canContinue,
  children,
  nextLabel = 'Continuar',
  nextBusy = false,
  nextVariant = 'primary',
  secondaryAction,
}: StageShellProps) {
  const percent = (current / total) * 100

  return (
    <main className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col px-4 pb-10 pt-5 sm:px-6 lg:px-8">
      <header className="mx-auto w-full max-w-3xl">
        <div className="flex min-h-11 items-center justify-between gap-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-base font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              Atrás
            </button>
          ) : <span />}
          <p className="text-base font-semibold text-primary">Paso {current} de {total}</p>
        </div>

        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-violet-950/15 dark:bg-violet-100/15"
          role="progressbar"
          aria-label={`Progreso del onboarding: paso ${current} de ${total}`}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={current}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="mb-8 mt-8">
          <h1 className="text-balance text-3xl font-bold leading-tight text-foreground sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{description}</p>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1">{children}</div>

      <footer className="mx-auto mt-10 grid w-full max-w-3xl gap-3 sm:grid-cols-2 sm:[&>*:only-child]:col-span-2">
        {secondaryAction}
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue || nextBusy}
          className={cn(
            'min-h-11 w-full rounded-2xl px-5 py-3 text-base font-bold transition-colors duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
            canContinue && !nextBusy && nextVariant === 'primary'
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-700/20 hover:bg-violet-500'
              : canContinue && !nextBusy
                ? 'border-2 border-border bg-card/60 text-foreground hover:border-violet-500/50'
              : 'cursor-not-allowed bg-muted text-muted-foreground',
          )}
        >
          {nextLabel}
        </button>
      </footer>
    </main>
  )
}

export function OptionButton({
  selected,
  onClick,
  icon: Icon,
  label,
  description,
  disabled = false,
}: {
  selected: boolean
  onClick: () => void
  icon: LucideIcon
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-14 w-full items-center gap-4 rounded-2xl border-2 px-4 py-3 text-left transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
        disabled
          ? 'cursor-not-allowed border-border bg-muted/60 text-muted-foreground opacity-70'
          : selected
          ? 'border-violet-500 bg-violet-500/10 text-foreground'
          : 'border-border bg-card/60 text-foreground hover:border-violet-500/50',
      )}
    >
      <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-xl', selected ? 'bg-violet-600 text-white' : 'bg-muted text-muted-foreground')}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold">{label}</span>
        {description ? <span className="mt-0.5 block text-base leading-6 text-muted-foreground">{description}</span> : null}
      </span>
      <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', selected ? 'border-violet-600 bg-violet-600' : 'border-border')}>
        {selected ? <Check className="h-4 w-4 text-white" aria-hidden="true" /> : null}
      </span>
    </button>
  )
}

export const focusableControlClass =
  'min-h-11 rounded-xl border-2 border-border bg-card/60 px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-violet-500 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none'
