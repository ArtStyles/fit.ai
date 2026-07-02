'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { BarChart2, CalendarDays, Home, Settings, Users } from 'lucide-react'
import { PendingLink } from './PendingLink'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'

// Routes where the bottom bar should be hidden (full-screen flows)
const HIDDEN_PREFIXES = ['/session', '/plans/generate', '/feed/new']

type Tab = {
  href:  string
  label: string
  icon:  React.ComponentType<{ className?: string }>
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
              className="group relative flex flex-col items-center justify-center px-1 py-1.5 min-w-[4.5rem]"
            >
              {/* icon bubble */}
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-[14px] transition-all duration-200',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground group-hover:text-foreground/70',
                )}
              >
                <Icon className="h-[22px] w-[22px]" />
              </span>
            </PendingLink>
          )
        })}
      </div>
    </nav>
  )
}
