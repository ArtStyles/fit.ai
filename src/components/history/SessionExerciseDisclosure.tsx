'use client'

import { ArrowUpRight } from 'lucide-react'
import { DisclosureSection } from '@/components/evidence/DisclosureSection'
import { useI18n } from '@/components/i18n/I18nProvider'
import { PendingLink } from '@/components/navigation/PendingLink'
import { dateLocale } from '@/lib/i18n'
import type { SessionExerciseEvidence } from './sessionDebrief'

function formatNumber(value: number, language: 'es' | 'en'): string {
  return new Intl.NumberFormat(dateLocale(language), { maximumFractionDigits: 1 }).format(value)
}

function comparisonText(exercise: SessionExerciseEvidence, language: 'es' | 'en'): string | null {
  if (!exercise.comparison) return null
  const weight = exercise.comparison.weightDeltaKg
  const reps = exercise.comparison.repsDelta
  const parts = [
    weight !== 0 ? `${weight > 0 ? '+' : ''}${formatNumber(weight, language)} kg` : null,
    reps !== 0 ? `${reps > 0 ? '+' : ''}${reps} reps` : null,
  ].filter(Boolean)
  if (parts.length === 0) return language === 'en' ? 'Same as previous appearance' : 'Igual que la aparición anterior'
  return `${language === 'en' ? 'Vs. previous' : 'Vs. anterior'} ${parts.join(' · ')}`
}

export function SessionExerciseDisclosure({
  index,
  exercise,
}: {
  index: number
  exercise: SessionExerciseEvidence
}) {
  const { language, t } = useI18n()
  const comparison = comparisonText(exercise, language)

  return (
    <article className="border-t border-border/60 py-5">
      <div className="flex items-start gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 font-display text-lg font-bold text-violet-200">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl font-semibold text-foreground">{exercise.exerciseName}</h3>
            {exercise.isRecord ? <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-200">PR</span> : null}
            {exercise.skipped ? <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-200">{t('Saltado')}</span> : null}
          </div>
          {exercise.muscleGroups.length > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">{exercise.muscleGroups.slice(0, 3).join(' · ')}</p>
          ) : null}

          {exercise.notes ? (
            <p className={exercise.skipped ? 'mt-3 rounded-xl border border-orange-500/20 bg-orange-500/[0.07] px-3 py-2 text-xs text-orange-100' : 'mt-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-3 py-2 text-xs text-violet-100'}>
              {exercise.notes}
            </p>
          ) : null}

          {!exercise.skipped ? (
            <>
              <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                <div><dt className="text-muted-foreground">{language === 'en' ? 'Best set' : 'Mejor serie'}</dt><dd className="mt-0.5 font-semibold tabular-nums text-foreground">{exercise.bestSet ? `${formatNumber(exercise.bestSet.weightKg, language)} kg × ${exercise.bestSet.reps}` : '—'}</dd></div>
                <div><dt className="text-muted-foreground">{t('Volumen')}</dt><dd className="mt-0.5 font-semibold tabular-nums text-foreground">{formatNumber(exercise.volumeKg, language)} kg</dd></div>
                <div><dt className="text-muted-foreground">RPE</dt><dd className="mt-0.5 font-semibold tabular-nums text-foreground">{exercise.averageRpe ?? '—'}</dd></div>
              </dl>
              {comparison ? <p className="mt-3 text-xs font-medium text-violet-200">{comparison}</p> : null}

              {exercise.sets.length > 0 ? (
                <DisclosureSection summary={t('Mostrar series')} className="mt-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th scope="col" className="pb-2 font-medium">Set</th>
                          <th scope="col" className="pb-2 text-right font-medium">{t('Peso')}</th>
                          <th scope="col" className="pb-2 text-right font-medium">{t('Reps')}</th>
                          <th scope="col" className="pb-2 text-right font-medium">RPE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exercise.sets.map((set, setIndex) => (
                          <tr key={setIndex} className="border-t border-border/50 tabular-nums text-foreground">
                            <th scope="row" className="py-2 text-left font-medium">{setIndex + 1}</th>
                            <td className="py-2 text-right">{formatNumber(set.weightKg, language)} kg</td>
                            <td className="py-2 text-right">{set.reps}</td>
                            <td className="py-2 text-right">{set.rpe ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </DisclosureSection>
              ) : null}
            </>
          ) : null}

          <PendingLink href={`/exercises/${exercise.exerciseId}`} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" spinnerClassName="h-3 w-3">
            {language === 'en' ? 'Open movement profile' : 'Abrir ficha del movimiento'}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </PendingLink>
        </div>
      </div>
    </article>
  )
}
