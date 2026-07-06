'use client'

import { AlertTriangle, Bone, HeartPulse, ShieldCheck, Stethoscope } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OnboardingAnswers } from '@/app/onboarding/types'
import { canContinueStage, requiresProfessionalClearance } from './onboardingStages'
import { focusableControlClass, StageShell, type OnboardingStageProps } from './StageShell'

const WARNING_OPTIONS = [
  ['chest_discomfort', 'Molestia o dolor en pecho, cuello, mandíbula o brazos'],
  ['dyspnea_at_rest_or_mild', 'Falta de aire en reposo o con esfuerzo leve'],
  ['dizziness_or_syncope', 'Mareo intenso, desmayo o pérdida de conciencia'],
  ['palpitations_or_unusual_fatigue', 'Palpitaciones o fatiga inusual con actividad normal'],
] as const

const LIMITATION_REGIONS = ['hombro', 'codo', 'muñeca', 'espalda', 'cadera', 'rodilla', 'tobillo'] as const

const LIMITATION_STATUSES = [
  ['stable', 'Estable'],
  ['recovering', 'En recuperación'],
  ['acute', 'Aguda'],
] as const

export function SafetyStage({ answers, update, current, total, onBack, onNext }: OnboardingStageProps) {
  function toggleWarning(value: string) {
    update(
      'warning_symptoms',
      answers.warning_symptoms.includes(value)
        ? answers.warning_symptoms.filter(item => item !== value)
        : [...answers.warning_symptoms, value],
    )
  }

  function toggleRegion(region: string) {
    update(
      'limitation_regions',
      answers.limitation_regions.includes(region)
        ? answers.limitation_regions.filter(item => item !== region)
        : [...answers.limitation_regions, region],
    )
  }

  const hasMedicalSignal = answers.warning_symptoms.length > 0 || answers.known_disease || answers.recent_surgery
  const hasLimitations = answers.limitation_regions.length > 0
  const blocked = requiresProfessionalClearance(answers)

  return (
    <StageShell
      title="Seguridad antes que intensidad"
      description="Este cribado no diagnostica. Nos ayuda a saber si el plan automático puede continuar o si necesitas orientación profesional."
      current={current}
      total={total}
      onBack={onBack}
      onNext={onNext}
      canContinue={canContinueStage('safety', answers)}
      nextLabel="Revisar mi información"
    >
      <div className="space-y-9">
        <section className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.04] p-5 sm:p-6" aria-labelledby="medical-heading">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-600 text-white">
              <HeartPulse className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 id="medical-heading" className="text-lg font-bold text-foreground">Señales de alerta</h2>
              <p className="mt-1 text-base leading-6 text-muted-foreground">Marca cualquier señal que presentes actualmente.</p>
            </div>
          </div>

          <div className="space-y-3">
            {WARNING_OPTIONS.map(([value, label]) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 text-base leading-6 text-foreground focus-within:ring-2 focus-within:ring-primary">
                <input
                  type="checkbox"
                  checked={answers.warning_symptoms.includes(value)}
                  onChange={() => toggleWarning(value)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-violet-600"
                />
                {label}
              </label>
            ))}

            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 text-base leading-6 text-foreground focus-within:ring-2 focus-within:ring-primary">
              <input type="checkbox" checked={answers.known_disease} onChange={event => update('known_disease', event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-violet-600" />
              Tengo una enfermedad cardiovascular, metabólica o renal diagnosticada.
            </label>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card/70 px-4 py-3 text-base leading-6 text-foreground focus-within:ring-2 focus-within:ring-primary">
              <input type="checkbox" checked={answers.recent_surgery} onChange={event => update('recent_surgery', event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-violet-600" />
              Tuve una cirugía reciente o tengo una restricción médica vigente.
            </label>

            {hasMedicalSignal ? (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-amber-600/50 bg-amber-500/10 px-4 py-3 text-base leading-6 text-foreground focus-within:ring-2 focus-within:ring-amber-500">
                <input type="checkbox" checked={answers.medically_cleared} onChange={event => update('medically_cleared', event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-amber-600" />
                Un profesional sanitario me autorizó expresamente a comenzar o continuar este nivel de ejercicio.
              </label>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="limitations-heading">
          <div className="mb-4 flex items-start gap-3">
            <Bone className="mt-0.5 h-6 w-6 shrink-0 text-violet-600" aria-hidden="true" />
            <div>
              <h2 id="limitations-heading" className="text-lg font-bold text-foreground">Lesiones y limitaciones</h2>
              <p className="mt-1 text-base leading-6 text-muted-foreground">Selecciona las zonas afectadas y describe solo movimientos que un profesional te haya indicado evitar.</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="injuries" className="text-base font-semibold text-foreground">Otras lesiones o antecedentes relevantes</label>
              <textarea
                id="injuries"
                name="injuries"
                value={answers.injuries}
                onChange={event => update('injuries', event.target.value)}
                rows={3}
                placeholder="Describe brevemente cualquier lesión relevante."
                className={`${focusableControlClass} w-full resize-y`}
              />
            </div>

            <fieldset>
              <legend className="mb-3 text-base font-semibold text-foreground">Zonas con limitación</legend>
              <div className="flex flex-wrap gap-2">
                {LIMITATION_REGIONS.map(region => {
                  const selected = answers.limitation_regions.includes(region)
                  return (
                    <button
                      key={region}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleRegion(region)}
                      className={cn(
                        'min-h-11 rounded-full border-2 px-4 py-2 text-base font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
                        selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-border bg-card/60 text-foreground hover:border-violet-500/50',
                      )}
                    >
                      {region}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            {hasLimitations ? (
              <div className="space-y-5 rounded-2xl border border-border bg-card/50 p-4 sm:p-5">
                <fieldset>
                  <legend className="mb-3 text-base font-semibold text-foreground">Estado de la limitación</legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {LIMITATION_STATUSES.map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={answers.limitation_status === value}
                        onClick={() => update('limitation_status', value as OnboardingAnswers['limitation_status'])}
                        className={cn(
                          'min-h-11 rounded-xl border-2 px-3 py-2 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
                          answers.limitation_status === value ? 'border-violet-600 bg-violet-600 text-white' : 'border-border text-foreground hover:border-violet-500/50',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="space-y-2">
                  <label htmlFor="movements_to_avoid" className="text-base font-semibold text-foreground">Movimientos que debes evitar</label>
                  <textarea
                    id="movements_to_avoid"
                    name="movements_to_avoid"
                    value={answers.movements_to_avoid}
                    onChange={event => update('movements_to_avoid', event.target.value)}
                    rows={3}
                    placeholder="Separados por comas; por ejemplo: sentadilla profunda, empuje vertical."
                    className={`${focusableControlClass} w-full resize-y`}
                  />
                </div>

                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3 text-base leading-6 text-foreground focus-within:ring-2 focus-within:ring-primary">
                  <input type="checkbox" checked={answers.clinician_cleared} onChange={event => update('clinician_cleared', event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-violet-600" />
                  Un profesional me autorizó a entrenar respetando estas restricciones.
                </label>
              </div>
            ) : null}
          </div>
        </section>

        {blocked ? (
          <div role="alert" className="flex gap-3 rounded-2xl border-2 border-amber-600/50 bg-amber-500/10 p-4 text-base leading-6 text-foreground">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div>
              <p className="font-bold">Se requiere orientación profesional</p>
              <p className="mt-1">Antes de generar una rutina necesitas orientación o autorización de un profesional de salud cualificado.</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 rounded-2xl border border-emerald-600/35 bg-emerald-500/10 p-4 text-base leading-6 text-foreground">
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
            <div>
              <p className="font-bold">Cribado listo para revisar</p>
              <p className="mt-1">Podrás confirmar estos datos antes de guardar tu perfil.</p>
            </div>
          </div>
        )}

        <p className="flex items-start gap-2 text-base leading-6 text-muted-foreground">
          <Stethoscope className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          Si tus síntomas cambian, detén el ejercicio y busca atención profesional.
        </p>
      </div>
    </StageShell>
  )
}
