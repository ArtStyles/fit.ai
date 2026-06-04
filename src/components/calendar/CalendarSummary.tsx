import { CalendarCheck, Dumbbell, Flame, TrendingUp } from 'lucide-react'
import type { CalendarStats } from '@/lib/calendar/aggregate'

export function CalendarSummary({ stats }: { stats: CalendarStats }) {
  const items = [
    { label: 'Días',     value: stats.trainedDays,         icon: CalendarCheck },
    { label: 'Racha',    value: `${stats.currentStreak}d`, icon: Flame },
    { label: 'Récord',   value: `${stats.maxStreak}d`,     icon: TrendingUp },
    { label: 'Días/sem', value: stats.avgPerWeek,          icon: Dumbbell },
  ]

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-2xl border border-border/60 bg-muted/10 p-3 text-center">
          <Icon className="mx-auto h-4 w-4 text-violet-300" />
          <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  )
}
