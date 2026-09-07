import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { PendingLink } from '@/components/navigation/PendingLink'
import { PlanRetireButton } from './PlanRetireButton'
import { activatePlan, createManualPlan } from '@/app/actions/plan'
import { CalendarDays, Check, ChevronDown, Plus, Sparkles } from 'lucide-react'
import { FREE_PLAN_LIMIT } from '@/lib/plans/entitlements'

export type PlanListRow = {
  id: string; name: string; goal: string | null; days_per_week: number | null; difficulty: string | null;
  source_type: 'ai' | 'engine' | 'manual' | 'imported' | 'shared_post' | 'trainer_assigned';
  created_at: string; is_active: boolean; prescription_locked: boolean;
}
const DIFFICULTY_LABELS: Record<string, string> = { beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado' }
export function formatDifficulty(value: string | null, t: (source: string) => string): string | null {
  if (!value) return null
  return t(DIFFICULTY_LABELS[value] ?? value)
}

export function formatSource(value: PlanListRow['source_type'], t: (source: string) => string): string {
  if (value === 'engine') return t('Motor basado en evidencia')
  if (value === 'manual') return t('Manual')
  if (value === 'shared_post') return t('Copiado')
  if (value === 'imported') return t('Importado')
  if (value === 'trainer_assigned') return t('Asignada por entrenador')
  return 'AI'
}

export function PlanSwitcher({ plans, tier, t }: { plans: PlanListRow[]; tier: 'free' | 'pro'; t: (source: string) => string }) {
  const personalCount = plans.filter(plan => !plan.prescription_locked).length
  const canCreate = tier === 'pro' || personalCount < FREE_PLAN_LIMIT
  const activePlan = plans.find(plan => plan.is_active)
  const planCount = String(plans.length)

  return (
    <details data-plan-library className="group overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {activePlan?.name ?? t('Tus rutinas')}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {activePlan ? t('Principal') : t('Elige un plan')} · {planCount} {t('planes')}
          </p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-border/50 bg-background/30 p-3">
        {plans.length > 0 && (
          <div className="space-y-2">
            {plans.map(plan => {
              const metadata = [
                formatSource(plan.source_type, t),
                plan.days_per_week ? `${plan.days_per_week} ${t('días/sem')}` : null,
                formatDifficulty(plan.difficulty, t),
              ].filter(Boolean).join(' · ')

              return (
                <div
                  key={plan.id}
                  className={`flex items-center gap-2 rounded-xl border p-2 ${
                    plan.is_active
                      ? 'border-violet-500/45 bg-violet-500/10'
                      : 'border-border/50 bg-background/30'
                  }`}
                >
                  {plan.is_active ? (
                    <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white">
                        <Check className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-foreground">{plan.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{metadata}</p>
                      </div>
                    </div>
                  ) : (
                    <form action={activatePlan} className="min-w-0 flex-1">
                      <input type="hidden" name="planId" value={plan.id} />
                      <SubmitButton
                        label={t('Usar')}
                        pendingLabel={t('Cambiando plan')}
                        variant="ghost"
                        className="h-auto w-full whitespace-normal justify-start gap-3 rounded-lg px-2 py-1.5 text-left font-normal hover:bg-muted/20 hover:text-foreground focus-visible:ring-violet-500"
                      >
                        <span className="h-8 w-8 shrink-0 rounded-full border-2 border-border/70" />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-semibold text-foreground">{plan.name}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{metadata}</span>
                        </span>
                        <span className="text-xs font-semibold text-violet-300">{t('Usar')}</span>
                      </SubmitButton>
                    </form>
                  )}
                  <PlanRetireButton planId={plan.id} planName={plan.name} professional={plan.prescription_locked} />
                </div>
              )
            })}
          </div>
        )}

        {canCreate ? (
          <div className="mt-3 border-t border-border/50 pt-3">
            <Button asChild className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600">
              <PendingLink href="/plans/generate">
                <Sparkles className="mr-2 h-4 w-4" />
                {t('Nuevo plan basado en evidencia')}
              </PendingLink>
            </Button>
            <details className="mt-1">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-violet-500 [&::-webkit-details-marker]:hidden">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('Crear manualmente')}
              </summary>
              <form action={createManualPlan} className="mt-2 space-y-3 rounded-xl border border-border/50 bg-background/40 p-3">
                <input name="name" required placeholder={t('Nombre del plan')} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
                <input name="goal" placeholder={t('Objetivo visible')} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500" />
                <div className="grid grid-cols-2 gap-2">
                  <select name="daysPerWeek" defaultValue="3" className="h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500">
                    {[1, 2, 3, 4, 5, 6, 7].map(day => <option key={day} value={day}>{day} {t('días')}</option>)}
                  </select>
                  <select name="difficulty" defaultValue="" className="h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500">
                    <option value="">{t('Nivel')}</option>
                    <option value="beginner">{t('Principiante')}</option>
                    <option value="intermediate">{t('Intermedio')}</option>
                    <option value="advanced">{t('Avanzado')}</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input name="makeActive" type="checkbox" defaultChecked className="h-11 w-11 shrink-0 accent-violet-500" />
                  {t('Activarlo ahora')}
                </label>
                <button className="h-11 w-full rounded-md bg-violet-500 text-sm font-semibold text-white hover:bg-violet-600">
                  {t('Crear plan manual')}
                </button>
              </form>
            </details>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
            <span className="shrink-0 rounded-full border border-border/60 bg-background/50 px-2 py-1 font-semibold">{personalCount}/{FREE_PLAN_LIMIT}</span>
            <span>{t('Elimina un plan personal para crear otro.')}</span>
          </div>
        )}
      </div>
    </details>
  )
}
