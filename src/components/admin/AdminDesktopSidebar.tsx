'use client'

import { LogOut } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'
import { ADMIN_NAV_ITEMS, isAdminNavItemActive } from './adminNavigation'

type AdminDesktopSidebarProps = {
  pendingTrainerCount?: number
}

export function AdminDesktopSidebar({ pendingTrainerCount }: AdminDesktopSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-[hsl(var(--surface-1))] lg:flex lg:flex-col">
      <PendingLink
        href="/admin"
        showSpinner={false}
        aria-label="Administración de Vekira"
        className="mx-5 mt-6 inline-flex min-h-11 min-w-11 items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <VekiraLogo markClassName="h-10 w-10" wordmarkClassName="text-base" />
      </PendingLink>

      <nav aria-label="Navegación administrativa" className="mt-10 flex flex-1 flex-col gap-2 px-4">
        {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = isAdminNavItemActive(pathname, href)
          const shouldShowBadge = href === '/admin/trainers' && pendingTrainerCount && pendingTrainerCount > 0

          return (
            <PendingLink
              key={href}
              href={href}
              showSpinner={false}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-11 min-w-11 items-center gap-3 rounded-xl px-4 text-sm font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-[hsl(var(--surface-2))] hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.5 : 2} />
              <span>{label}</span>
              {shouldShowBadge ? <span aria-hidden="true" className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{pendingTrainerCount}</span> : null}
            </PendingLink>
          )
        })}
      </nav>

      <div className="border-t border-border/60 p-4">
        <PendingLink
          href="/dashboard"
          showSpinner={false}
          className="flex min-h-11 min-w-11 items-center gap-3 rounded-xl px-4 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:bg-[hsl(var(--surface-2))] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut aria-hidden="true" className="h-5 w-5 shrink-0" />
          Volver a Vekira
        </PendingLink>
      </div>
    </aside>
  )
}
