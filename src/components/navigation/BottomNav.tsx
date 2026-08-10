'use client'

import { usePathname } from 'next/navigation'
import { PendingLink } from './PendingLink'
import { getAppNavIcon, isAppNavItemActive, type AppNavItem } from './appNavigation'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { hapticImpact } from '@/lib/native/haptics'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import type { Workspace } from '@/lib/coaching/workspace'

// Routes where the bottom bar should be hidden (full-screen flows)
const HIDDEN_PREFIXES = ['/session', '/plans/generate', '/feed/new']

export function BottomNav({ navItems, workspace }: { navItems: readonly AppNavItem[], workspace?: Workspace }) {
  const pathname = usePathname()
  const { t } = useI18n()

  if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return null

  return (
    <nav
      aria-label={t('Navegación principal')}
      className="fitai-safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border/50 bg-background/95 backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-center px-2">
        {navItems.map(({ href, label }) => {
          const Icon = getAppNavIcon(href)
          const isActive = isAppNavItemActive(pathname, href)
          const isTrainAction = href === '/entrenar'

          return (
            <PendingLink
              key={href}
              href={href}
              showSpinner={false}
              aria-label={t(label)}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => { void hapticImpact('light') }}
              className="group relative flex min-w-0 flex-1 cursor-pointer touch-manipulation flex-col items-center justify-center px-1 py-1.5 outline-none [aria-busy=true]:opacity-100"
            >
              <span
                className={cn(
                  'flex items-center justify-center transition-[color,background-color,transform,box-shadow] duration-200 ease-out group-active:scale-90 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
                  isTrainAction
                    ? '-translate-y-2 h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:bg-primary/90'
                    : 'h-10 w-10 rounded-xl',
                  !isTrainAction && isActive
                    ? 'fitai-nav-selected text-primary'
                    : !isTrainAction && 'text-muted-foreground group-hover:text-foreground',
                )}
              >
                {isActive && href === '/dashboard' ? (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-[23px] w-[23px] fill-current"
                  >
                    <path
                      d="M12 2.25 2.75 9.45v10.3A2.25 2.25 0 0 0 5 22h3.75v-7.25a3.25 3.25 0 0 1 6.5 0V22H19a2.25 2.25 0 0 0 2.25-2.25V9.45L12 2.25Z"
                    />
                  </svg>
                ) : (
                  <Icon
                    aria-hidden="true"
                    className={cn('transition-[stroke-width] duration-150', isTrainAction ? 'h-6 w-6' : 'h-[22px] w-[22px]')}
                    strokeWidth={isActive || isTrainAction ? 2.75 : 2}
                  />
                )}
              </span>
              <span className={cn(
                'mt-0.5 max-w-full truncate text-[10px] font-semibold leading-none transition-colors',
                isTrainAction ? '-mt-1 text-primary' : isActive ? 'text-primary' : 'text-muted-foreground',
              )}>
                {t(label)}
              </span>
            </PendingLink>
          )
        })}
        {workspace ? <WorkspaceSwitcher workspace={workspace} variant="mobile" /> : null}
      </div>
    </nav>
  )
}
