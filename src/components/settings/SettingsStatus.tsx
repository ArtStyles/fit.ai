import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SettingsStatusTone = 'info' | 'success' | 'warning' | 'error'

export function SettingsStatus({
  tone = 'info',
  children,
}: {
  tone?: SettingsStatusTone
  children: ReactNode
}) {
  const isError = tone === 'error'

  return (
    <p
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? undefined : 'polite'}
      className={cn(
        'rounded-xl border px-3 py-2 text-sm',
        tone === 'success' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
        tone === 'warning' && 'border-amber-500/30 bg-amber-500/10 text-amber-200',
        tone === 'error' && 'border-red-500/30 bg-red-500/10 text-red-200',
        tone === 'info' && 'border-border/60 bg-muted/10 text-muted-foreground',
      )}
    >
      {children}
    </p>
  )
}
