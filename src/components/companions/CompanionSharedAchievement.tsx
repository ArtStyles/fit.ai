'use client'

import { Award } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { CompanionSnapshot } from '@/lib/companions/types'
import { useCompanionWeeklyAchievement } from './useCompanionConnection'

export function CompanionSharedAchievement({ snapshot, compact = false }: { snapshot: CompanionSnapshot | null; compact?: boolean }) {
  const { t } = useI18n()
  const achieved = useCompanionWeeklyAchievement(snapshot)
  if (!achieved) return null
  const Title = compact ? 'p' : 'h3'
  return <div className={`mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-300/15 bg-emerald-400/[0.06] ${compact ? 'px-3 py-2.5' : 'p-4'}`}>
    <Award aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
    <div className="min-w-0">
      <Title className={`${compact ? 'text-xs' : 'text-sm'} font-semibold leading-relaxed text-emerald-200`}>{t('Semana completada juntos')}</Title>
      {!compact ? <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('Cada uno alcanzó la meta de su propio plan.')}</p> : null}
    </div>
  </div>
}
