'use client'

import Link from 'next/link'
import { ArrowRight, Crown, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AvatarUploader } from '@/components/profile/AvatarUploader'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'

interface Props {
  greeting:      string
  firstName:     string
  avatarUrl:     string | null
  momentumScore: number
  username:      string | null
  subscriptionTier: 'free' | 'pro'
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

export function DashboardHeader({
  greeting,
  firstName,
  avatarUrl,
  momentumScore,
  username,
  subscriptionTier,
}: Props) {
  const { t } = useI18n()
  const initials = firstName.slice(0, 2).toUpperCase()
  const momentum = getMomentumStyle(momentumScore)

  return (
    <header className="mx-auto flex max-w-lg items-center gap-3 px-4 pb-2 pt-6">
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
            <span className="font-semibold normal-case tracking-normal opacity-70">· {t(momentum.label)}</span>
          </span>
        </div>
      </div>

      <PendingLink
        href="/pricing"
        aria-label={subscriptionTier === 'pro' ? t('Ver suscripción Pro') : t('Actualizar a Pro')}
        className={cn(
          'group inline-flex h-11 shrink-0 items-center gap-2 rounded-full border p-1.5 pr-3 shadow-sm transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          subscriptionTier === 'pro'
            ? 'border-violet-500/35 bg-violet-500/10 hover:border-violet-400/60 hover:bg-violet-500/15'
            : 'border-border/70 bg-card/70 hover:border-violet-500/40 hover:bg-violet-500/[0.07]',
        )}
        spinnerClassName="h-3.5 w-3.5"
      >
        <span className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
          subscriptionTier === 'pro'
            ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md shadow-violet-950/40'
            : 'bg-violet-500/[0.12] text-violet-300 group-hover:bg-violet-500/20',
        )}>
          <Crown className="h-4 w-4" strokeWidth={2} />
        </span>

        <span className="text-xs font-semibold text-muted-foreground">
          {subscriptionTier === 'pro' ? 'Pro' : 'Free'}
        </span>
        <span aria-hidden className="h-3.5 w-px bg-border/80" />
        <span className="text-xs font-bold text-foreground transition-colors group-hover:text-violet-200">
          {subscriptionTier === 'pro' ? t('Gestionar') : t('Pasar a Pro')}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-violet-300 transition-transform group-hover:translate-x-0.5" />
      </PendingLink>
    </header>
  )
}
