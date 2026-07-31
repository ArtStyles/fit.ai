'use client'

import { CheckCircle2, ChevronRight } from 'lucide-react'

import { useI18n } from '@/components/i18n/I18nProvider'
import { cn } from '@/lib/utils'
import type { SetData } from '@/store/sessionStore'

type CompactSetSummaryProps = {
  setNumber: number
  data: SetData
  relation: 'previous' | 'next'
  onEdit?: () => void
}

function setValue(data: SetData, t: (source: string, values?: Record<string, string | number>) => string) {
  if (data.durationSeconds) return t('{seconds} s', { seconds: data.durationSeconds })
  const values = [
    data.weightKg ? t('{weight} kg', { weight: data.weightKg }) : null,
    data.reps ? t('{count} repeticiones', { count: data.reps }) : null,
    data.rpe ? `RPE ${data.rpe}` : null,
  ]
  return values.filter(Boolean).join(' · ') || t('Sin registrar')
}

export function CompactSetSummary({ setNumber, data, relation, onEdit }: CompactSetSummaryProps) {
  const { t } = useI18n()
  const content = (
    <>
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold', relation === 'previous' ? 'bg-[hsl(var(--training-complete)/0.12)] text-[hsl(var(--training-complete))]' : 'bg-muted/35 text-muted-foreground')}>
        {relation === 'previous' ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : setNumber}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {relation === 'previous' ? t('Serie anterior') : t('Siguiente serie')}
        </span>
        <span className="mt-1 block truncate text-sm font-semibold text-foreground">{setValue(data, t)}</span>
      </span>
      {onEdit && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
    </>
  )

  if (onEdit) {
    return (
      <button type="button" onClick={onEdit} className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-border/60 bg-[hsl(var(--surface-1))] px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
        {content}
      </button>
    )
  }

  return <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-border/50 bg-[hsl(var(--surface-1))]/70 px-4 py-3 opacity-80">{content}</div>
}
