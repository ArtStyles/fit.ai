'use client'

import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { SessionSummaryRow, type SessionSummarySignal } from '@/components/evidence/SessionSummaryRow'
import { useI18n } from '@/components/i18n/I18nProvider'
import { dateLocale } from '@/lib/i18n'
import { shiftDateStr } from '@/lib/calendar/aggregate'
import { groupEvidenceSessions } from '@/lib/training-evidence/timeline'
import { cn } from '@/lib/utils'
import type { HistoryEvidenceRow, HistorySignal } from './historyViewModel'

type HistoryMode = 'all' | 'week' | 'volume'

function formatDate(value: string, language: 'es' | 'en'): string {
  return new Intl.DateTimeFormat(dateLocale(language), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function monthLabel(key: string, language: 'es' | 'en'): string {
  const [year, month] = key.split('-').map(Number)
  const label = new Intl.DateTimeFormat(dateLocale(language), { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function signalPresentation(signal: HistorySignal, language: 'es' | 'en'): SessionSummarySignal | null {
  if (!signal) return null
  if (signal.kind === 'record') {
    return { label: signal.count === 1 ? 'PR' : `${signal.count} PR`, tone: 'record' }
  }
  if (signal.kind === 'volume') {
    return {
      label: `${signal.changePercent > 0 ? '+' : ''}${signal.changePercent}% ${language === 'en' ? 'volume' : 'volumen'}`,
      tone: signal.changePercent >= 0 ? 'success' : 'warning',
    }
  }
  return { label: `RPE ${signal.value}`, tone: signal.value >= 9 ? 'warning' : 'neutral' }
}

function currentWeekStart(todayStr: string): string {
  const [year, month, day] = todayStr.split('-').map(Number)
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
  return shiftDateStr(todayStr, -weekday)
}

export function HistorySessionList({ rows, todayStr }: { rows: HistoryEvidenceRow[]; todayStr: string }) {
  const { language, t } = useI18n()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<HistoryMode>('all')

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    const weekStart = currentWeekStart(todayStr)
    const filtered = rows.filter(row => {
      if (mode === 'week' && row.date < weekStart) return false
      return !normalizedQuery || row.searchText.includes(normalizedQuery)
    })
    return mode === 'volume'
      ? [...filtered].sort((a, b) => b.volumeKg - a.volumeKg || b.completedAt.localeCompare(a.completedAt))
      : filtered
  }, [mode, query, rows, todayStr])

  const groups = useMemo(
    () => mode === 'volume'
      ? [{ key: 'volume', sessions: filteredRows }]
      : groupEvidenceSessions(filteredRows, todayStr),
    [filteredRows, mode, todayStr],
  )
  const modes: { value: HistoryMode; label: string }[] = [
    { value: 'all', label: t('Todas') },
    { value: 'week', label: t('Esta semana') },
    { value: 'volume', label: t('Mayor volumen') },
  ]
  const clearFilters = () => {
    setMode('all')
    setQuery('')
  }

  return (
    <section aria-labelledby="history-timeline-title">
      <div>
        <h2 id="history-timeline-title" className="text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">{t('Registro cronológico')}</h2>
        <p className="mt-1 font-display text-2xl font-bold text-foreground">{t('Últimas sesiones completadas')}</p>
      </div>

      <div className="mt-5 rounded-2xl border border-border/60 bg-muted/[0.05] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('Buscar rutina, foco o fecha')}
            className="h-11 w-full rounded-xl border border-border/60 bg-background/70 pl-9 pr-11 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 hover:text-foreground" aria-label={t('Limpiar búsqueda')}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" /></span>
          {modes.map(item => (
            <button
              key={item.value}
              type="button"
              aria-pressed={mode === item.value}
              onClick={() => setMode(item.value)}
              className={cn(
                'min-h-11 shrink-0 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
                mode === item.value
                  ? 'border-violet-500/40 bg-violet-500/15 text-violet-100'
                  : 'border-border/50 bg-background/50 text-muted-foreground hover:border-violet-500/30 hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{filteredRows.length} / {rows.length} {t('sesiones')}</p>
        {mode !== 'all' || query ? (
          <button type="button" onClick={clearFilters} className="min-h-11 text-xs font-semibold text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
            {t('Limpiar filtros')}
          </button>
        ) : null}
      </div>

      {filteredRows.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center">
          <Search className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-foreground">{t('Sin resultados')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('Prueba con otro nombre, foco o rango.')}</p>
          <button type="button" onClick={clearFilters} className="mt-4 min-h-11 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 text-sm font-semibold text-violet-100 hover:bg-violet-500/20">
            {t('Limpiar filtros')}
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-7">
          {groups.map(group => (
            <section key={group.key} aria-label={group.key === 'current-week' ? t('Esta semana') : group.key === 'volume' ? t('Mayor volumen') : monthLabel(group.key, language)}>
              <div className="flex items-center gap-3">
                <h3 className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {group.key === 'current-week' ? t('Esta semana') : group.key === 'volume' ? t('Mayor volumen') : monthLabel(group.key, language)}
                </h3>
                <span className="h-px flex-1 bg-border/60" />
              </div>
              <div className="mt-2">
                {group.sessions.map(row => (
                  <SessionSummaryRow
                    key={row.id}
                    href={`/history/${row.id}`}
                    dateLabel={formatDate(row.completedAt, language)}
                    title={row.workoutName}
                    context={row.focus}
                    signal={signalPresentation(row.signal, language)}
                    metrics={[
                      { label: t('Duración'), value: `${row.durationMinutes} min` },
                      { label: t('Series'), value: String(row.sets) },
                      { label: t('Volumen'), value: `${new Intl.NumberFormat(dateLocale(language), { maximumFractionDigits: 0 }).format(row.volumeKg)} kg` },
                    ]}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
