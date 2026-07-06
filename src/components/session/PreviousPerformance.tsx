'use client'

import { History } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { formatPreviousPerformance, type PreviousPerformanceSet } from './sessionViewModel'

export function PreviousPerformance({
  performance,
}: {
  performance: PreviousPerformanceSet[] | null | undefined
}) {
  const { language, t } = useI18n()
  const formatted = formatPreviousPerformance(performance ?? [], language)
  if (!formatted) return null

  return (
    <section className="rounded-lg border border-border/50 bg-background/50 px-3 py-2" aria-label={t('Rendimiento anterior')}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <History className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{t('Anterior')}</span>
      </div>
      <p className="mt-1 text-sm font-medium tabular-nums text-foreground">{formatted}</p>
    </section>
  )
}
