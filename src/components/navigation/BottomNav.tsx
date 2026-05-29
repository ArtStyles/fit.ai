'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { BarChart2, CalendarDays, Home, MessageSquare } from 'lucide-react'
import { PendingLink } from './PendingLink'
import { cn } from '@/lib/utils'

// Routes where the bottom bar should be hidden (full-screen flows)
const HIDDEN_PREFIXES = ['/session', '/plans/generate']

type Tab = {
  href:   string
  label:  string
  icon:   React.ComponentType<{ className?: string }>
  accent?: true
}

const TABS: Tab[] = [
  { href: '/dashboard', label: 'Inicio',    icon: Home           },
  { href: '/plan',      label: 'Plan',      icon: CalendarDays   },
  { href: '/chat',      label: 'Coach IA',  icon: MessageSquare, accent: true },
  { href: '/history',   label: 'Historial', icon: BarChart2      },
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
        {TABS.map(({ href, label, icon: Icon, accent }) => {
          const isActive =
            pathname === href ||
            (href !== '/dashboard' && pathname.startsWith(href + '/'))

          return (
            <PendingLink
              key={href}
              href={href}
              showSpinner={false}
              className="group flex flex-col items-center gap-0.5 px-1 py-1.5 min-w-[4.5rem]"
            >
              {/* icon bubble */}
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-[14px] transition-all duration-200',
                  accent
                    ? isActive
                      ? 'bg-violet-500 text-white shadow-md shadow-violet-500/40 scale-105'
                      : 'bg-violet-500/12 text-violet-400 group-hover:bg-violet-500/20'
                    : isActive
                      ? 'bg-white/10 text-foreground'
                      : 'text-muted-foreground group-hover:text-foreground/70',
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>

              {/* label */}
              <span
                className={cn(
                  'text-[10px] leading-none transition-colors',
                  accent
                    ? isActive
                      ? 'font-semibold text-violet-400'
                      : 'text-muted-foreground/80'
                    : isActive
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground/80',
                )}
              >
                {label}
              </span>
            </PendingLink>
          )
        })}
      </div>
    </nav>
  )
}
