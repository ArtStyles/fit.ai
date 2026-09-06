'use client'

import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { Briefcase, LogOut, Settings, UserRound } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import type { Workspace } from '@/lib/coaching/workspace'
import { cn } from '@/lib/utils'
import {
  useOptionalAccountWorkspace,
  type AccountWorkspaceModel,
} from './AccountWorkspaceContext'
import {
  AccountWorkspaceTrigger,
  accountInitials,
} from './AccountWorkspaceTrigger'
import { PendingLink } from './PendingLink'

type MenuBodyProps = {
  presentation?: 'dialog' | 'menu'
  account: AccountWorkspaceModel['account']
  workspace: Workspace
  canUseCoach: boolean
  pendingWorkspace: Workspace | null
  error: string | null
  onWorkspaceChange: (workspace: Workspace) => void
  onSignOut: () => void
}

export function AccountWorkspaceMenuBody({
  presentation = 'dialog',
  account,
  workspace,
  canUseCoach,
  pendingWorkspace,
  error,
  onWorkspaceChange,
  onSignOut,
}: MenuBodyProps) {
  const { t } = useI18n()
  const spaces: readonly Workspace[] = canUseCoach
    ? ['personal', 'coach']
    : ['personal']
  const activeLabel = workspace === 'coach' ? t('Entrenador') : t('Personal')
  const interactionLocked = pendingWorkspace !== null
  const guardedLinkProps = interactionLocked
    ? {
        'aria-disabled': true,
        tabIndex: -1,
        onClick: (event: MouseEvent<HTMLAnchorElement>) => event.preventDefault(),
      }
    : {}

  if (presentation === 'menu') {
    return (
      <>
        <DropdownMenuLabel className="flex min-w-0 items-center gap-3 px-2 py-2">
          <Avatar className="h-12 w-12 shrink-0">
            {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt="" /> : null}
            <AvatarFallback>{accountInitials(account.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-foreground">
              {account.name?.trim() || t('Usuario')}
            </span>
            <span className="block truncate text-sm font-normal text-muted-foreground">
              {account.email}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('Espacio activo')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={workspace} aria-label={t('Selector de espacio')}>
          {spaces.map(option => {
            const Icon = option === 'coach' ? Briefcase : UserRound
            const label = option === 'coach' ? t('Entrenador') : t('Personal')
            return (
              <DropdownMenuRadioItem
                key={option}
                value={option}
                disabled={interactionLocked}
                onSelect={event => {
                  event.preventDefault()
                  onWorkspaceChange(option)
                }}
                className="min-h-11 gap-2 rounded-xl pr-3 text-sm font-semibold"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        {pendingWorkspace ? (
          <DropdownMenuLabel asChild>
            <p role="status" aria-live="polite" className="px-3 py-2 text-sm font-normal text-muted-foreground">
              {t('Cambiando al espacio {workspace}…', {
                workspace: pendingWorkspace === 'coach' ? t('Entrenador') : t('Personal'),
              })}
            </p>
          </DropdownMenuLabel>
        ) : null}
        {error ? (
          <DropdownMenuLabel asChild>
            <p role="alert" className="px-3 py-2 text-sm font-normal text-destructive">{t(error)}</p>
          </DropdownMenuLabel>
        ) : null}
        <DropdownMenuSeparator />
        {workspace === 'coach' ? (
          <>
            <DropdownMenuItem disabled={interactionLocked} asChild>
              <PendingLink {...guardedLinkProps} href="/coach/profile" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
                {t('Perfil profesional')}
              </PendingLink>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={interactionLocked} asChild>
              <PendingLink {...guardedLinkProps} href="/coach/services" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
                {t('Servicios')}
              </PendingLink>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem disabled={interactionLocked} asChild>
              <PendingLink {...guardedLinkProps} href="/settings/perfil" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
                {t('Perfil personal')}
              </PendingLink>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={interactionLocked} asChild>
              <PendingLink {...guardedLinkProps} href="/coaching" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
                {t('Mi acompañamiento')}
              </PendingLink>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem disabled={interactionLocked} asChild>
          <PendingLink {...guardedLinkProps} href="/settings" showSpinner={false} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
            <Settings className="h-4 w-4" aria-hidden="true" />
            {t('Ajustes')}
          </PendingLink>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={interactionLocked} asChild>
          <button
            type="button"
            data-account-sign-out
            disabled={interactionLocked}
            onClick={onSignOut}
            className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-red-700 dark:text-red-400 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t('Cerrar sesión')}
          </button>
        </DropdownMenuItem>
      </>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex min-w-0 items-center gap-3 pr-12">
        <Avatar className="h-12 w-12 shrink-0">
          {account.avatarUrl ? <AvatarImage src={account.avatarUrl} alt="" /> : null}
          <AvatarFallback>{accountInitials(account.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">
            {account.name?.trim() || t('Usuario')}
          </p>
          <p className="truncate text-sm text-muted-foreground">{account.email}</p>
        </div>
      </div>
      <section aria-label={t('Selector de espacio')}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('Espacio activo')}
        </p>
        <div className={cn('mt-2 grid gap-2', canUseCoach ? 'grid-cols-2' : 'grid-cols-1')}>
          {spaces.map(option => {
            const selected = workspace === option
            const Icon = option === 'coach' ? Briefcase : UserRound
            const label = option === 'coach' ? t('Entrenador') : t('Personal')
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                disabled={interactionLocked}
                onClick={() => onWorkspaceChange(option)}
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold',
                  'outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                  selected
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
      </section>
      {pendingWorkspace ? (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {t('Cambiando al espacio {workspace}…', {
            workspace: pendingWorkspace === 'coach' ? t('Entrenador') : t('Personal'),
          })}
        </p>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{t(error)}</p> : null}
      <nav aria-label={t('Enlaces de cuenta')} className="grid gap-1 border-t border-border/60 pt-3">
        {workspace === 'coach' ? (
          <>
            <PendingLink {...guardedLinkProps} href="/coach/profile" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
              {t('Perfil profesional')}
            </PendingLink>
            <PendingLink {...guardedLinkProps} href="/coach/services" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
              {t('Servicios')}
            </PendingLink>
          </>
        ) : (
          <>
            <PendingLink {...guardedLinkProps} href="/settings/perfil" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
              {t('Perfil personal')}
            </PendingLink>
            <PendingLink {...guardedLinkProps} href="/coaching" showSpinner={false} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
              {t('Mi acompañamiento')}
            </PendingLink>
          </>
        )}
        <PendingLink {...guardedLinkProps} href="/settings" showSpinner={false} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-60">
          <Settings className="h-4 w-4" aria-hidden="true" />
          {t('Ajustes')}
        </PendingLink>
      </nav>
      <div className="border-t border-border/60 pt-3">
        <button
          type="button"
          data-account-sign-out
          disabled={interactionLocked}
          onClick={onSignOut}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm font-semibold text-destructive disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {t('Cerrar sesión')}
        </button>
      </div>
      <span className="sr-only">{t('Espacio activo')}: {activeLabel}</span>
    </div>
  )
}

function AccountWorkspaceMenuTitle() {
  const { t } = useI18n()
  return <>{t('Cuenta y espacios')}</>
}

export function AccountWorkspaceMenu({
  surface,
}: {
  surface: 'topbar' | 'dashboard' | 'sidebar'
}) {
  const context = useOptionalAccountWorkspace()
  const desktopTitleId = useId()
  const mobileContentRef = useRef<HTMLDivElement>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopOpen, setDesktopOpen] = useState(false)

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeInactivePortal = () => {
      if (desktop.matches) setMobileOpen(false)
      else setDesktopOpen(false)
    }
    closeInactivePortal()
    desktop.addEventListener('change', closeInactivePortal)
    return () => desktop.removeEventListener('change', closeInactivePortal)
  }, [])

  if (!context) return null

  const triggerVariant = surface === 'dashboard'
    ? 'dashboard'
    : surface === 'sidebar'
      ? 'sidebar'
      : 'compact'
  const renderTrigger = () => (
    <AccountWorkspaceTrigger
      variant={triggerVariant}
      workspace={context.presentedWorkspace}
      name={context.account.name}
      avatarUrl={context.account.avatarUrl}
      pending={context.pendingWorkspace !== null}
    />
  )
  const renderBody = (presentation: 'dialog' | 'menu') => (
    <AccountWorkspaceMenuBody
      presentation={presentation}
      account={context.account}
      workspace={context.presentedWorkspace}
      canUseCoach={context.trainerAccess.granted}
      pendingWorkspace={context.pendingWorkspace}
      error={context.error}
      onSignOut={() => { void context.signOutAccount() }}
      onWorkspaceChange={target => {
        void context.changeWorkspace(target).then(outcome => {
          if (outcome.status === 'navigating' || outcome.status === 'redirecting') {
            setMobileOpen(false)
            setDesktopOpen(false)
          }
        })
      }}
    />
  )
  const changeMobileOpen = (next: boolean) => {
    setMobileOpen(next)
    if (!next) context.clearError()
  }
  const changeDesktopOpen = (next: boolean) => {
    setDesktopOpen(next)
    if (!next) context.clearError()
  }

  return (
    <>
      {surface !== 'sidebar' ? (
        <div className="lg:hidden">
          <Dialog open={mobileOpen} onOpenChange={changeMobileOpen}>
            <DialogTrigger asChild>{renderTrigger()}</DialogTrigger>
            <DialogContent
              ref={mobileContentRef}
              aria-describedby={undefined}
              className="gap-4 border-border/70 bg-popover"
              onOpenAutoFocus={event => {
                event.preventDefault()
                mobileContentRef.current?.querySelector<HTMLButtonElement>(
                  '[aria-pressed="true"]',
                )
                  ?.focus()
              }}
            >
              <DialogTitle className="sr-only">
                <AccountWorkspaceMenuTitle />
              </DialogTitle>
              {renderBody('dialog')}
            </DialogContent>
          </Dialog>
        </div>
      ) : null}
      {surface === 'sidebar' ? (
        <div className="hidden lg:block">
          <DropdownMenu modal={false} open={desktopOpen} onOpenChange={changeDesktopOpen}>
            <DropdownMenuTrigger asChild>{renderTrigger()}</DropdownMenuTrigger>
            <DropdownMenuContent
              aria-labelledby={desktopTitleId}
              side={surface === 'sidebar' ? 'right' : 'bottom'}
              sideOffset={surface === 'sidebar' ? 16 : 4}
              align="end"
              className="w-80 rounded-2xl border-border/70 p-4"
            >
              <DropdownMenuLabel asChild>
                <span id={desktopTitleId} className="sr-only">
                  <AccountWorkspaceMenuTitle />
                </span>
              </DropdownMenuLabel>
              {renderBody('menu')}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </>
  )
}
