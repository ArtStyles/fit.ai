'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/components/i18n/I18nProvider'

interface Props {
  message: string
}

export function DailyBrief({ message }: Props) {
  const { t } = useI18n()
  const [phase,     setPhase]     = useState<'thinking' | 'visible'>('thinking')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setPhase('visible'), 720)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className={cn(
      'relative overflow-hidden rounded-2xl transition-all duration-300',
      'border border-white/8 bg-white/[0.04] backdrop-blur-xl',
      'shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_32px_rgba(0,0,0,0.25)]',
    )}>
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-violet-500/20 blur-2xl"
      />

      <div className="relative px-4 py-3.5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="relative shrink-0">
              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
              <span
                aria-hidden
                className="absolute inset-0 h-3.5 w-3.5 animate-ping rounded-full bg-violet-400/30"
              />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80">
              Coach IA
            </span>

            {/* Typing dots while thinking */}
            {phase === 'thinking' && !collapsed && (
              <span className="ml-0.5 flex items-center gap-0.5">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="h-1 w-1 animate-bounce rounded-full bg-violet-400/60"
                    style={{ animationDelay: `${i * 140}ms`, animationDuration: '0.9s' }}
                  />
                ))}
              </span>
            )}
          </div>

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(v => !v)}
            className="-my-1.5 -mr-2 flex h-11 w-11 cursor-pointer items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:text-muted-foreground/80"
            aria-label={collapsed ? t('Expandir mensaje del coach') : t('Colapsar mensaje del coach')}
          >
            <ChevronDown className={cn(
              'h-3.5 w-3.5 transition-transform duration-200',
              collapsed && 'rotate-180',
            )} />
          </button>
        </div>

        {/* Message content */}
        {!collapsed && (
          phase === 'thinking' ? (
            <div className="mt-2.5 space-y-2 py-0.5">
              <div className="h-3 w-full animate-pulse rounded-full bg-white/[0.06]" />
              <div className="h-3 w-4/5 animate-pulse rounded-full bg-white/[0.06]" />
            </div>
          ) : (
            <p className="mt-2.5 animate-in fade-in duration-500 text-sm leading-relaxed text-foreground/80">
              {message}
            </p>
          )
        )}
      </div>
    </div>
  )
}
