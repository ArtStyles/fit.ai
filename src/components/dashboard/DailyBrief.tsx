'use client'

import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  message: string
}

export function DailyBrief({ message }: Props) {
  const [phase, setPhase] = useState<'thinking' | 'visible'>('thinking')

  useEffect(() => {
    const t = setTimeout(() => setPhase('visible'), 720)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/8 via-violet-500/4 to-transparent px-4 py-3.5 space-y-2.5">

      {/* header chip */}
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <Sparkles className="h-3.5 w-3.5 text-violet-400" />
          <span className="absolute inset-0 h-3.5 w-3.5 animate-ping rounded-full bg-violet-400/25" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80">
          Coach IA
        </span>

        {/* typing dots while thinking */}
        {phase === 'thinking' && (
          <span className="ml-0.5 flex items-center gap-0.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="h-1 w-1 rounded-full bg-violet-400/60 animate-bounce"
                style={{ animationDelay: `${i * 140}ms`, animationDuration: '0.9s' }}
              />
            ))}
          </span>
        )}
      </div>

      {/* content */}
      {phase === 'thinking' ? (
        <div className="space-y-2 py-0.5">
          <div className="h-3 w-full animate-pulse rounded-full bg-white/[0.06]" />
          <div className="h-3 w-4/5 animate-pulse rounded-full bg-white/[0.06]" />
        </div>
      ) : (
        <p
          className={cn(
            'text-sm leading-relaxed text-foreground/80',
            'animate-in fade-in duration-500',
          )}
        >
          {message}
        </p>
      )}
    </div>
  )
}
