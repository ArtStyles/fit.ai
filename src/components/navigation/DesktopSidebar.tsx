'use client'

import { usePathname } from 'next/navigation'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { useI18n } from '@/components/i18n/I18nProvider'
import { cn } from '@/lib/utils'
import { getAppNavIcon, isAppNavItemActive } from './appNavigation'
import { PendingLink } from './PendingLink'
import { AccountWorkspaceMenu } from './AccountWorkspaceMenu'
import { useAccountWorkspace } from './AccountWorkspaceContext'
import { isImmersiveWorkspaceRoute } from './workspacePresentation'

export function DesktopSidebar() {
  const pathname = usePathname()
  const { navItems, presentedWorkspace } = useAccountWorkspace()
  const { t } = useI18n()
  const homeHref = presentedWorkspace === 'coach' ? '/coach' : '/dashboard'

  if (isImmersiveWorkspaceRoute(pathname)) return null

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border/60 bg-[hsl(var(--surface-1))] lg:flex lg:flex-col">
      <PendingLink
        href={homeHref}
        showSpinner={false}
        aria-label={t('Inicio')}
        className="mx-5 mt-6 inline-flex min-h-11 items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <VekiraLogo markClassName="h-10 w-10" />
      </PendingLink>

      <nav aria-label={t('Navegación principal')} className="mt-10 flex flex-1 flex-col gap-2 px-4">
        {navItems.map(({ href, label }) => {
          const Icon = getAppNavIcon(href)
          const isActive = isAppNavItemActive(pathname, href)

          return (
            <PendingLink
              key={href}
              href={href}
              showSpinner={false}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-4 text-sm font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:bg-[hsl(var(--surface-2))] hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={isActive ? 2.5 : 2} />
              <span>{t(label)}</span>
            </PendingLink>
          )
        })}
      </nav>
      <div className="border-t border-border/60 p-4">
        <AccountWorkspaceMenu surface="sidebar" />
      </div>
    </aside>
  )
}
