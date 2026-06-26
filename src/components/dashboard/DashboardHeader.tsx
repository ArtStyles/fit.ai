'use client'

import Link from 'next/link'
import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DevModeBanner } from '@/components/DevModeBanner'
import { AvatarUploader } from '@/components/profile/AvatarUploader'

interface Props {
  greeting:      string
  firstName:     string
  avatarUrl:     string | null
  momentumScore: number
  username:      string | null
}

// ─── Momentum chip ────────────────────────────────────────────────────────────

function getMomentumStyle(score: number) {
  if (score >= 91) return { label: 'Imparable',    classes: 'border-orange-500/30 bg-orange-500/10 text-orange-400' }
  if (score >= 76) return { label: 'Al máximo',    classes: 'border-violet-500/30 bg-violet-500/10 text-violet-400' }
  if (score >= 51) return { label: 'En forma',     classes: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400' }
  if (score >= 26) return { label: 'Construyendo', classes: 'border-blue-500/30 bg-blue-500/10 text-blue-400'      }
  return                  { label: 'Arrancando',   classes: 'border-border/40 bg-muted/20 text-muted-foreground'    }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardHeader({ greeting, firstName, avatarUrl, momentumScore, username }: Props) {
  const initials = firstName.slice(0, 2).toUpperCase()
  const momentum = getMomentumStyle(momentumScore)

  return (
    <header className="mx-auto flex max-w-lg items-center gap-4 px-4 pb-2 pt-6">
      <AvatarUploader avatarUrl={avatarUrl} initials={initials} size="header" />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-normal text-muted-foreground">{greeting},</p>
        {username ? (
          <Link href={`/u/${username}`} className="truncate text-xl font-semibold leading-tight text-foreground hover:underline">
            {firstName}
          </Link>
        ) : (
          <p className="truncate text-xl font-semibold leading-tight text-foreground">{firstName}</p>
        )}

        <div className="mt-1.5 flex items-center gap-1.5">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            momentum.classes,
          )}>
            <Zap className="h-2.5 w-2.5" />
            {momentumScore}
            <span className="font-semibold normal-case tracking-normal opacity-70">· {momentum.label}</span>
          </span>
        </div>
      </div>

      <DevModeBanner />
    </header>
  )
}
