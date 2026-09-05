'use client'

import { forwardRef, useId } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Briefcase, Loader2, UserRound } from 'lucide-react'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { Workspace } from '@/lib/coaching/workspace'
import { cn } from '@/lib/utils'

export type AccountWorkspaceTriggerProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'className' | 'name'
> & {
  variant: 'compact' | 'dashboard' | 'sidebar'
  workspace: Workspace
  name: string | null
  avatarUrl: string | null
  pending: boolean
  className?: string
}

export function accountInitials(name: string | null): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (!words.length) return 'V'
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase()
}

export const AccountWorkspaceTrigger = forwardRef<
  HTMLButtonElement,
  AccountWorkspaceTriggerProps
>(function AccountWorkspaceTrigger({
  variant,
  workspace,
  name,
  avatarUrl,
  pending,
  className,
  disabled,
  ...buttonProps
}, ref) {
  const { t } = useI18n()
  const workspaceDescriptionId = useId()
  const WorkspaceIcon = workspace === 'coach' ? Briefcase : UserRound
  const workspaceLabel = workspace === 'coach' ? t('Entrenador') : t('Personal')
  const dashboard = variant === 'dashboard'
  const sidebar = variant === 'sidebar'

  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      data-account-workspace-trigger
      aria-label={t('Abrir cuenta y espacios')}
      aria-describedby={workspaceDescriptionId}
      aria-busy={pending || undefined}
      disabled={pending || disabled}
      className={cn(
        'relative flex min-h-11 min-w-11 shrink-0 items-center rounded-xl outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        dashboard && 'h-20 w-20 justify-center rounded-full',
        !dashboard && !sidebar && 'h-11 w-11 justify-center',
        sidebar && 'w-full gap-3 px-2 py-2 text-left hover:bg-muted/40',
        className,
      )}
    >
      <span data-account-workspace-avatar className="relative flex shrink-0">
        <Avatar className={cn(dashboard ? 'h-20 w-20' : 'h-10 w-10')}>
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback>{accountInitials(name)}</AvatarFallback>
        </Avatar>
        <span
          aria-hidden="true"
          data-account-workspace-badge
          className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[hsl(var(--surface-1))] bg-primary text-primary-foreground"
        >
          {pending
            ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
            : <WorkspaceIcon className="h-3 w-3" />}
        </span>
      </span>
      {sidebar ? (
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            {name?.trim() || t('Usuario')}
          </span>
          <span className="block text-xs text-muted-foreground">{workspaceLabel}</span>
        </span>
      ) : null}
      <span id={workspaceDescriptionId} className="sr-only">
        {t('Espacio activo')}: {workspaceLabel}
      </span>
    </button>
  )
})
