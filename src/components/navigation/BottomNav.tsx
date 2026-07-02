'use client'

import { usePathname } from 'next/navigation'
import { BarChart2, CalendarDays, Home, Settings, Users, type LucideIcon } from 'lucide-react'
import { PendingLink } from './PendingLink'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'
import { hapticImpact } from '@/lib/native/haptics'

// Routes where the bottom bar should be hidden (full-screen flows)
const HIDDEN_PREFIXES = ['/session', '/plans/generate', '/feed/new']

type Tab = {
  href:  string
  label: string
  icon:  LucideIcon
}

const TABS: Tab[] = [
  { href: '/dashboard', label: 'Inicio',     icon: Home         },
  { href: '/plan',      label: 'Plan',       icon: CalendarDays },
  { href: '/feed',      label: 'Comunidad',  icon: Users        },
  { href: '/settings',  label: 'Ajustes',    icon: Settings     },
  { href: '/history',   label: 'Historial',  icon: BarChart2    },
]

export function BottomNav() {
  const pathname = usePathname()
  const { t } = useI18n()

  if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return null

  return (
    <nav
      aria-label={t('Navegación principal')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-background/90 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {TABS.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== '/dashboard' && pathname.startsWith(href + '/'))

          return (
            <PendingLink
              key={href}
              href={href}
              showSpinner={false}
              aria-label={t(label)}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => { void hapticImpact('light') }}
              className="group relative flex min-w-[4.5rem] touch-manipulation flex-col items-center justify-center px-1 py-1.5 outline-none [aria-busy=true]:opacity-100"
            >
              {/* Instagram-like feedback: compress on press, then pop into the active state. */}
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-[14px] transition-[color,transform] duration-150 ease-out group-active:scale-[0.82] group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background',
                  isActive
                    ? 'fitai-nav-selected text-primary'
                    : 'text-muted-foreground group-hover:text-foreground/70',
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
                    className="h-[23px] w-[23px] transition-[stroke-width] duration-150"
                    strokeWidth={isActive ? 2.75 : 2}
                  />
                )}
              </span>
            </PendingLink>
          )
        })}
      </div>
    </nav>
  )
}
