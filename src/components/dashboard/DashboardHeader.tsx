'use client'

import Link from 'next/link'
import { forwardRef, useId, type ButtonHTMLAttributes } from 'react'
import { Bell, ChevronDown } from 'lucide-react'
import { AccountWorkspaceMenu } from '@/components/navigation/AccountWorkspaceMenu'
import { useOptionalAccountWorkspace } from '@/components/navigation/AccountWorkspaceContext'
import { FixedTopBar } from '@/components/navigation/FixedTopBar'
import { useI18n } from '@/components/i18n/I18nProvider'
import { ProfilePhotoViewer } from '@/components/profile/ProfilePhotoViewer'

interface Props {
  greeting: string
  firstName: string
  dateLabel: string
  profileHref: `/u/${string}` | null
  hasNotificationAttention?: boolean
}

type GreetingProps = Pick<Props, 'greeting' | 'firstName' | 'dateLabel'> & { id?: string }

function DashboardGreeting({ greeting, firstName, dateLabel, id }: GreetingProps) {
  return (
    <span id={id} className="block min-w-0 flex-1">
      <span className="block truncate text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground first-letter:uppercase">{dateLabel}</span>
      <span className="block truncate font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
        <span className="text-base font-medium text-muted-foreground">{greeting}, </span>
        <span data-marketing-private>{firstName}</span>
      </span>
    </span>
  )
}

const DashboardAccountTrigger = forwardRef<
  HTMLButtonElement,
  GreetingProps & ButtonHTMLAttributes<HTMLButtonElement>
>(function DashboardAccountTrigger({ greeting, firstName, dateLabel, ...buttonProps }, ref) {
  const { t } = useI18n()
  const actionId = useId()
  const greetingId = useId()
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      data-account-workspace-trigger
      aria-labelledby={`${actionId} ${greetingId}`}
      className="flex min-h-14 w-full min-w-0 items-center gap-1 rounded-xl py-1 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transition-none"
    >
      <span id={actionId} className="sr-only">{t('Abrir cuenta y espacios')}</span>
      <DashboardGreeting id={greetingId} greeting={greeting} firstName={firstName} dateLabel={dateLabel} />
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
})

export function DashboardHeader({
  greeting,
  firstName,
  dateLabel,
  hasNotificationAttention = false,
}: Props) {
  const { t } = useI18n()
  const account = useOptionalAccountWorkspace()
  const workspaceDescriptionId = useId()

  return (
    <FixedTopBar accountSlot="custom" initialHeight={92} contentClassName="max-w-6xl flex-col items-stretch gap-0 sm:px-6">
      <div className="flex items-center gap-3">
        <ProfilePhotoViewer name={account?.account.name ?? firstName} avatarUrl={account?.account.avatarUrl ?? null} />
        {account ? (
          <AccountWorkspaceMenu
            surface="dashboard"
            className="min-w-0 flex-1"
            trigger={(
              <DashboardAccountTrigger
                greeting={greeting}
                firstName={firstName}
                dateLabel={dateLabel}
                aria-describedby={workspaceDescriptionId}
                aria-busy={account.pendingWorkspace !== null || undefined}
                disabled={account.pendingWorkspace !== null}
              />
            )}
          />
        ) : <div className="min-w-0 flex-1"><DashboardGreeting greeting={greeting} firstName={firstName} dateLabel={dateLabel} /></div>}
        <span id={workspaceDescriptionId} className="sr-only">
          {t('Espacio activo')}: {account?.presentedWorkspace === 'coach' ? t('Entrenador') : t('Personal')}
        </span>
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
