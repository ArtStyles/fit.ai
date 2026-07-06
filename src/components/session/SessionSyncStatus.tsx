'use client'

import { Check, Cloud, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { sessionSyncLabel, type SessionSyncState } from './sessionViewModel'

export function SessionSyncStatus({
  state,
  onRetry,
  className,
}: {
  state: SessionSyncState
  onRetry?: () => void
  className?: string
}) {
  const { language } = useI18n()
  const label = sessionSyncLabel(state, language)

  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        disabled={!onRetry}
        className={cn(
          'inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-semibold text-red-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-default',
          className,
        )}
        aria-label={label}
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
    )
  }

  const Icon = state === 'syncing' ? Loader2 : state === 'synced' ? Check : Cloud
  return (
    <div className={cn('inline-flex min-h-[44px] items-center gap-2 text-xs text-muted-foreground', className)} aria-live="polite">
      <Icon className={cn('h-4 w-4', state === 'syncing' && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}
