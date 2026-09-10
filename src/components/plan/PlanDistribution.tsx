'use client'

import { useI18n } from '@/components/i18n/I18nProvider'
import { MuscleActivityMap } from '@/components/muscles/MuscleActivityMap'
import type { MuscleActivityInput } from '@/lib/muscles/activity'
import type { PlanDistributionItem } from './planViewModel'

function DistributionRow({ item }: { item: PlanDistributionItem }) {
  return (
    <li className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-foreground">{item.muscleGroup}</span>
        <span className="text-muted-foreground">{item.prescribedSets}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted/50" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-300 transition-[width] duration-[var(--motion-progress)] motion-reduce:transition-none"
          style={{ width: `${item.relativePercent}%` }}
        />
      </div>
    </li>
  )
}

export function PlanDistribution({ items, muscleActivity }: { items: PlanDistributionItem[]; muscleActivity: MuscleActivityInput[] }) {
  const { t, language } = useI18n()

  return (
    <section aria-labelledby="plan-distribution-title" className="rounded-3xl border border-border/70 bg-[hsl(var(--surface-1))] p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{t('Distribución')}</p>
      <h2 id="plan-distribution-title" className="mt-1 font-display text-2xl font-bold text-foreground">{language === 'en' ? 'Your plan, muscle by muscle' : 'Tu plan, músculo a músculo'}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('Comparación de series prescritas por grupo muscular.')}</p>

      <MuscleActivityMap rows={muscleActivity} mode="planned" language={language} />

      {items.length > 0 && <details className="mt-4 border-t border-border/60 pt-2">
        <summary className="flex min-h-11 cursor-pointer items-center rounded-xl px-2 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">{t('Cobertura relativa')}</summary>
        <ul className="mt-3 space-y-4" aria-label={t('Cobertura relativa')}>
          {items.map(item => <DistributionRow key={item.muscleGroup} item={item} />)}
        </ul>
      </details>}
    </section>
  )
}
