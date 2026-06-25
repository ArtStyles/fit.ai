'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { BarChart2, CalendarDays, Home, Settings, Users } from 'lucide-react'
import { PendingLink } from './PendingLink'
import { cn } from '@/lib/utils'

// Routes where the bottom bar should be hidden (full-screen flows)
const HIDDEN_PREFIXES = ['/session', '/plans/generate']

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

  if (HIDDEN_PREFIXES.some(p => pathname.startsWith(p))) return null

  return (
    <nav
      aria-label="Navegación principal"
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
              aria-label={label}
              className="group relative flex flex-col items-center justify-center px-1 py-1.5 min-w-[4.5rem]"
            >
              {/* icon bubble */}
              <span
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-[14px] transition-all duration-200',
                  isActive
                    ? 'bg-white/12 text-foreground ring-1 ring-white/10'
                    : 'text-muted-foreground group-hover:text-foreground/70',
                )}
              >
                <Icon className="h-[22px] w-[22px]" />
              </span>

              {/* active dot indicator */}
              {isActive && (
                <span className="absolute bottom-0 h-0.5 w-5 rounded-full bg-current opacity-50" />
              )}
            </PendingLink>
          )
        })}
      </div>
    </nav>
  )
}
