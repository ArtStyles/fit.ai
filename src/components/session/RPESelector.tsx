'use client'

import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'

interface Props {
  value:    number | null
  onChange: (rpe: number) => void
  disabled?: boolean
}

const RPE_COLORS: Record<number, string> = {
  1:  'text-green-400',
  2:  'text-green-400',
  3:  'text-green-400',
  4:  'text-yellow-400',
  5:  'text-yellow-400',
  6:  'text-yellow-400',
  7:  'text-orange-400',
  8:  'text-orange-400',
  9:  'text-red-400',
  10: 'text-red-400',
}

export function RPESelector({ value, onChange, disabled }: Props) {
  const { t } = useI18n()
  const displayed = value ?? '—'
  const colorClass = value ? (RPE_COLORS[value] ?? 'text-foreground') : 'text-muted-foreground'

  function decrement() {
    const next = Math.max(1, (value ?? 7) - 1)
    onChange(next)
  }

  function increment() {
    const next = Math.min(10, (value ?? 7) + 1)
    onChange(next)
  }

  return (
    <div className={cn(
      'flex items-center justify-center gap-0.5',
      disabled && 'opacity-50 pointer-events-none',
    )}>
      <button
        type="button"
        onClick={decrement}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 motion-reduce:transition-none"
        aria-label={t('Reducir RPE')}
      >
        <span className="text-sm font-bold">−</span>
      </button>

      <span className={cn('w-5 text-center text-sm font-bold tabular-nums', colorClass)}>
        {displayed}
      </span>

      <button
        type="button"
        onClick={increment}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 motion-reduce:transition-none"
        aria-label={t('Aumentar RPE')}
      >
        <span className="text-sm font-bold">+</span>
      </button>
    </div>
  )
}
