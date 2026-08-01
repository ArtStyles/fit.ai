'use client'

import { useState } from 'react'
import type { ProgressLocale } from './progressSummary'
import type { ProgressWeekBucket } from './progressViewModel'

function number(value: number, locale: ProgressLocale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'es-ES', { maximumFractionDigits: 0 }).format(value)
}

function dateLabel(startDate: string, endDate: string, locale: ProgressLocale): string {
  const dateLocale = locale === 'en' ? 'en-US' : 'es-ES'
  const format = (value: string) => {
    const [year, month, day] = value.split('-').map(Number)
    return new Intl.DateTimeFormat(dateLocale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, day)))
  }
  return `${format(startDate)} – ${format(endDate)}`
}

export function TrainingLoadChart({ buckets, locale }: { buckets: ProgressWeekBucket[]; locale: ProgressLocale }) {
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, buckets.length - 1))
  const selected = buckets[selectedIndex] ?? buckets.at(-1)
  const maxVolume = Math.max(1, ...buckets.map(bucket => bucket.volumeKg))

  if (!selected) return null

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[38rem] items-end gap-2" role="group" aria-label={locale === 'en' ? 'Weekly training load' : 'Carga semanal de entrenamiento'}>
          {buckets.map((bucket, index) => {
            const label = dateLabel(bucket.startDate, bucket.endDate, locale)
            const height = bucket.volumeKg > 0 ? Math.max(8, Math.round((bucket.volumeKg / maxVolume) * 100)) : 3
            return (
              <button
                key={bucket.startDate}
                type="button"
                aria-pressed={selectedIndex === index}
                aria-label={`${label}: ${number(bucket.volumeKg, locale)} kg · ${bucket.sessions} ${locale === 'en' ? 'sessions' : 'sesiones'}`}
                onClick={() => setSelectedIndex(index)}
                className="group flex min-h-44 min-w-0 flex-1 flex-col justify-end rounded-xl px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <span className="flex h-32 w-full items-end overflow-hidden rounded-t-lg bg-muted/10" aria-hidden="true">
                  <span
                    className="w-full rounded-t-lg bg-violet-500/35 transition-[height,background-color] duration-300 group-hover:bg-violet-400/60 group-aria-pressed:bg-violet-400 motion-reduce:transition-none"
                    style={{ height: `${height}%` }}
                  />
                </span>
                <span className="mt-2 text-[11px] font-semibold tabular-nums text-muted-foreground">{bucket.sessions}</span>
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-3 border-t border-border/50 pt-3 text-sm text-muted-foreground" aria-live="polite">
        <span className="font-semibold capitalize text-foreground">{dateLabel(selected.startDate, selected.endDate, locale)}</span>
        {' · '}{number(selected.volumeKg, locale)} kg
        {' · '}{selected.sessions} {locale === 'en' ? (selected.sessions === 1 ? 'session' : 'sessions') : (selected.sessions === 1 ? 'sesión' : 'sesiones')}
      </p>
    </div>
  )
}
