'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { AccountWorkspaceMenu } from '@/components/navigation/AccountWorkspaceMenu'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'
import { useI18n } from '@/components/i18n/I18nProvider'

interface Props {
  greeting: string
  firstName: string
  dateLabel: string
  profileHref: `/u/${string}` | null
  hasNotificationAttention?: boolean
}

export function DashboardHeader({
  greeting,
  firstName,
  dateLabel,
  profileHref,
  hasNotificationAttention = false,
}: Props) {
  const { t } = useI18n()

  return (
    <FixedTopBar accountSlot="custom" initialHeight={92} contentClassName="max-w-6xl flex-col items-stretch gap-0 sm:px-6">
      <div className="flex items-center gap-3">
        <AccountWorkspaceMenu surface="dashboard" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground first-letter:uppercase">{dateLabel}</p>
          <div className="truncate text-balance font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
            <span className="text-base font-medium text-muted-foreground">{greeting}, </span>
            {profileHref ? (
              <Link
                data-marketing-private
                href={profileHref}
                className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                {firstName}
              </Link>
            ) : <span data-marketing-private>{firstName}</span>}
          </div>
        </div>
        <Link
          href="/notifications"
          aria-label={t('Abrir notificaciones')}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-foreground transition-colors hover:border-violet-400/50 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 motion-reduce:transition-none"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {hasNotificationAttention ? <span aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[hsl(var(--training-warning))]" /> : null}
        </Link>
      </div>
    </FixedTopBar>
  )
}
