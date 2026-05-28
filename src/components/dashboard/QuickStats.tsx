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
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground px-0.5">
          Tu progreso
        </p>
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

  const streakCopy =
    streak === 0 ? 'Retoma tu racha' :
    streak === 1 ? '1 día · ¡vas bien!' :
    `${streak} días · sigue así`

  return (
    <div>
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground px-0.5">
        Tu progreso
      </p>
      <PendingLink
        href="/history"
        className="grid grid-cols-3 gap-2.5 focus-visible:outline-none group"
        spinnerClassName="hidden"
      >
        <StatCard
          icon={<Flame className="h-4 w-4" />}
          value={streakCopy}
          label="Racha actual"
          iconClass="text-orange-400"
          highlight={streak >= 3}
        />
        <StatCard
          icon={<CalendarCheck className="h-4 w-4" />}
          value={`${sessionsThisWeek}/${scheduledThisWeek} sesiones`}
          label="Esta semana"
          iconClass="text-indigo-400"
        />
        <StatCard
          icon={<Weight className="h-4 w-4" />}
          value={`${volumeKg} kg`}
          label="Volumen"
          iconClass="text-emerald-400"
        />
      </PendingLink>
    </div>
  )
}

function StatCard({
  icon, value, label, iconClass, highlight = false,
}: {
  icon:       React.ReactNode
  value:      string
  label:      string
  iconClass:  string
  highlight?: boolean
}) {
  return (
    <div className={cn(
      'flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/10 p-3.5',
      'transition-colors hover:bg-muted/20',
      highlight && 'border-orange-500/20 bg-orange-500/5',
    )}>
      <span className={cn('mb-0.5', iconClass)}>{icon}</span>
      <span className="min-h-10 text-sm font-semibold text-foreground leading-snug">
        {value}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}
