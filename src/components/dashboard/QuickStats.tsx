import { Flame, CalendarCheck, Weight } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'

interface Props {
  streak:              number
  sessionsThisWeek:    number
  scheduledThisWeek:   number
  volumeKg:            number
  hasCompletedSessions: boolean
}

export function QuickStats({
  streak,
  sessionsThisWeek,
  scheduledThisWeek,
  volumeKg,
  hasCompletedSessions,
}: Props) {
  if (!hasCompletedSessions) {
    return (
      <div>
        <div className="mb-3 flex items-center gap-2 px-0.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">Tu progreso</span>
          <div className="h-px flex-1 bg-border/40" />
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border/60 bg-muted/10 p-5">
          <span className="shrink-0 text-4xl leading-none opacity-60" aria-hidden="true">💪</span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">Empieza tu camino</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Tu primera sesión te espera. Cada serie cuenta.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const streakLabel = streak === 0 ? 'Retoma tu racha' :
    streak === 1 ? '¡Vas bien!' : 'Sigue así'

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">Tu progreso</span>
        <div className="h-px flex-1 bg-border/40" />
      </div>
      <PendingLink
        href="/history"
        className="grid grid-cols-2 grid-rows-2 gap-2.5 focus-visible:outline-none"
        spinnerClassName="hidden"
      >
        {/* Racha — tarjeta grande ocupa fila completa */}
        <div className={cn(
          'col-span-2 flex items-center gap-4 rounded-2xl border p-4 transition-all',
          streak >= 3
            ? 'border-orange-500/25 bg-gradient-to-r from-orange-500/10 to-orange-500/5'
            : 'border-border/60 bg-muted/10',
        )}>
          <div className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
            streak >= 3 ? 'bg-orange-500/15 text-orange-400' : 'bg-muted/30 text-muted-foreground',
          )}>
            <Flame className={cn('h-6 w-6', streak >= 3 && 'drop-shadow-[0_0_8px_rgba(249,115,22,0.6)]')} />
          </div>
          <div className="min-w-0">
            <p className={cn(
              'font-display text-3xl font-bold leading-none tracking-tight',
              streak >= 3 ? 'text-orange-400 drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]' : 'text-foreground',
            )}>
              {streak > 0 ? streak : '—'}
              {streak > 0 && <span className="ml-1 text-base font-sans font-medium text-muted-foreground">días</span>}
            </p>
            <p className={cn(
              'mt-0.5 text-sm',
              streak >= 3 ? 'text-orange-400/70' : 'text-muted-foreground',
            )}>
              {streakLabel}
            </p>
          </div>
        </div>

        {/* Sesiones semana */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-muted/10 p-3.5 transition-colors hover:bg-muted/20">
          <CalendarCheck className="h-4 w-4 text-indigo-400" />
          <span className="font-display text-xl font-bold text-foreground tracking-tight leading-none">
            {sessionsThisWeek}
            <span className="text-sm font-sans font-medium text-muted-foreground">/{scheduledThisWeek}</span>
          </span>
          <span className="text-[11px] text-muted-foreground">Esta semana</span>
        </div>

        {/* Volumen */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-muted/10 p-3.5 transition-colors hover:bg-muted/20">
          <Weight className="h-4 w-4 text-emerald-400" />
          <span className="font-display text-xl font-bold text-foreground tracking-tight leading-none">
            {volumeKg}
            <span className="text-sm font-sans font-medium text-muted-foreground"> kg</span>
          </span>
          <span className="text-[11px] text-muted-foreground">Volumen</span>
        </div>
      </PendingLink>
    </div>
  )
}
