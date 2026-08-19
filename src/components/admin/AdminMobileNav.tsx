'use client'

import { LogOut } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_ITEMS, isAdminNavItemActive } from './adminNavigation'

type AdminMobileNavProps = {
  pendingTrainerCount?: number
}

type AdminMobileHeaderProps = {
  adminLabel: string
}

export function AdminMobileHeader({ adminLabel }: AdminMobileHeaderProps) {
  return (
    <header className="flex min-h-16 items-center justify-between border-b border-border/60 px-4 lg:hidden">
      <VekiraLogo markClassName="h-9 w-9" wordmarkClassName="text-sm" />
      <div className="min-w-0 text-right">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">Administración</p>
        <p className="truncate text-sm text-muted-foreground">{adminLabel}</p>
      </div>
    </header>
  )
}

export function AdminMobileNav({ pendingTrainerCount }: AdminMobileNavProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="NavegaciÃ³n administrativa" className="flex border-t border-border/60 bg-[hsl(var(--surface-1))] px-1 pb-[var(--app-safe-area-bottom)] lg:hidden">
      {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = isAdminNavItemActive(pathname, href)
        const shouldShowBadge = href === '/admin/trainers' && pendingTrainerCount && pendingTrainerCount > 0

        return (
          <PendingLink
            key={href}
            href={href}
            showSpinner={false}
            aria-current={isActive ? 'page' : undefined}
            aria-label={label}
            className={cn(
              'relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center rounded-xl text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
            <span>{label}</span>
            {shouldShowBadge ? <span aria-hidden="true" className="absolute right-2 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">{pendingTrainerCount}</span> : null}
          </PendingLink>
        )
      })}
      <PendingLink
        href="/dashboard"
        showSpinner={false}
        aria-label="Salir a Vekira"
        className="flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center rounded-xl text-xs font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LogOut aria-hidden="true" className="h-5 w-5" />
        <span>Salir a Vekira</span>
      </PendingLink>
    </nav>
  )
}
