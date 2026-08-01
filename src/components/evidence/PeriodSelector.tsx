'use client'

import { cn } from '@/lib/utils'

export type PeriodOption<T extends number> = {
  value: T
  label: string
}

export function PeriodSelector<T extends number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T
  options: PeriodOption<T>[]
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div
      className={cn('grid grid-cols-3 gap-1 rounded-2xl border border-border/50 bg-background/40 p-1', className)}
      aria-label={label}
    >
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className="min-h-11 rounded-xl px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 aria-pressed:bg-violet-600 aria-pressed:text-white"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
