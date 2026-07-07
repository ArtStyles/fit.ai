'use client'

import { CalendarCheck, Dumbbell, Flame, TrendingUp } from 'lucide-react'
import type { CalendarStats } from '@/lib/calendar/aggregate'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'

export function CalendarSummary({ stats }: { stats: CalendarStats }) {
  const { t } = useI18n()
  const items = [
    { label: 'Días',     value: stats.trainedDays,         icon: CalendarCheck },
    { label: 'Racha',    value: `${stats.currentStreak}d`, icon: Flame },
    { label: 'Récord',   value: `${stats.maxStreak}d`,     icon: TrendingUp },
    { label: 'Días/sem', value: stats.avgPerWeek,          icon: Dumbbell },
  ]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {items.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border/60 bg-muted/10 p-3 text-center">
            <Icon className="mx-auto h-4 w-4 text-violet-300" />
            <p className="mt-2 font-display text-xl font-bold tabular-nums text-foreground">{value}</p>
            <p className="text-[11px] text-muted-foreground">{t(label)}</p>
          </div>
        ))}
      </div>
      <PendingLink
        href="/progress"
        className="flex min-h-11 items-center justify-center rounded-2xl border border-violet-500/25 bg-violet-500/10 px-4 text-sm font-semibold text-violet-100 transition-colors hover:bg-violet-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
        spinnerClassName="h-4 w-4"
      >
        {t('Ver progreso completo')}
      </PendingLink>
    </div>
  )
}
