'use client'

import { useState } from 'react'
import { AlertTriangle, CalendarDays, Dumbbell, HeartPulse, MapPin, Ruler, Scale, Sparkles, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OnboardingAnswers } from '@/app/onboarding/types'
import { requiresProfessionalClearance } from './onboardingStages'
import { validateConfirmationFields } from './confirmationValidation'
import { focusableControlClass, StageShell, type AnswerUpdate } from './StageShell'

const GENDERS = [
  ['male', 'Hombre'],
  ['female', 'Mujer'],
  ['other', 'Otro'],
] as const

const GOAL_LABELS: Record<string, string> = {
  lose_weight: 'Perder grasa',
  build_muscle: 'Ganar músculo',
  gain_strength: 'Ganar fuerza',
  stay_active: 'Mantenerme activo',
  improve_endurance: 'Mejorar resistencia',
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
}

const LOCATION_LABELS: Record<string, string> = {
  home_no_equipment: 'Casa sin equipo',
  home_basic: 'Casa con equipo básico',
  full_gym: 'Gimnasio completo',
}

interface ConfirmationStageProps {
  answers: OnboardingAnswers
  update: AnswerUpdate
  current: number
  total: number
  onBack: () => void
  onAutomatic: () => void
  onManual: () => Promise<void>
  submissionError?: string | null
}

export function ConfirmationStage({
  answers,
  update,
  current,
  total,
  onBack,
  onAutomatic,
  onManual,
  submissionError,
}: ConfirmationStageProps) {
  const [manualBusy, setManualBusy] = useState(false)
  const validation = validateConfirmationFields(answers)
  const demographicsValid = validation.valid
  const professionalBlock = requiresProfessionalClearance(answers)
  const automaticDisabled = !demographicsValid || professionalBlock || manualBusy

  async function handleManual() {
    setManualBusy(true)
    try {
      await onManual()
    } finally {
      setManualBusy(false)
    }
  }

  const summary = [
    { icon: Sparkles, label: 'Objetivo', value: answers.goal ? GOAL_LABELS[answers.goal] ?? answers.goal : 'Sin definir' },
    { icon: Dumbbell, label: 'Nivel', value: answers.fitness_level ? LEVEL_LABELS[answers.fitness_level] ?? answers.fitness_level : 'Sin definir' },
    { icon: CalendarDays, label: 'Disponibilidad', value: `${answers.days_per_week ?? '—'} días · ${answers.session_duration ?? '—'} min` },
    { icon: HeartPulse, label: 'Cardio', value: `${answers.cardio_preferences.length} modalidad${answers.cardio_preferences.length === 1 ? '' : 'es'}` },
    { icon: MapPin, label: 'Espacio', value: answers.gym_type ? LOCATION_LABELS[answers.gym_type] ?? answers.gym_type : 'Sin definir' },
    { icon: UserRound, label: 'Seguridad', value: professionalBlock ? 'Requiere orientación profesional' : answers.limitation_regions.length > 0 ? 'Plan con modificaciones' : 'Sin alertas declaradas' },
  ]

  const automaticAction = (
    <button
      type="button"
      onClick={onAutomatic}
      disabled={automaticDisabled}
      className={cn(
        'min-h-11 w-full rounded-2xl px-5 py-3 text-base font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
        automaticDisabled
          ? 'cursor-not-allowed bg-muted text-muted-foreground'
          : 'bg-violet-600 text-white shadow-lg shadow-violet-700/20 hover:bg-violet-500',
      )}
    >
      Generar mi plan automáticamente
    </button>
  )

  return (
    <StageShell
      title="Confirma tu punto de partida"
      description="Completa tus datos demográficos, revisa el resumen y elige cómo quieres crear tu primer plan."
      current={current}
      total={total}
      onBack={onBack}
      onNext={handleManual}
      canContinue={demographicsValid && !manualBusy}
      nextBusy={manualBusy}
      nextVariant="secondary"
      nextLabel={manualBusy ? 'Guardando perfil…' : 'Guardar y crear manualmente'}
      secondaryAction={automaticAction}
    >
      <div className="space-y-9">
        {submissionError ? (
          <div role="alert" className="rounded-2xl border-2 border-red-600/40 bg-red-500/10 p-4 text-base text-foreground">
            {submissionError}
          </div>
        ) : null}
        <section className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.04] p-5 sm:p-6" aria-labelledby="demographics-heading">
          <h2 id="demographics-heading" className="text-lg font-bold text-foreground">Datos demográficos</h2>
          <p className="mt-1 text-base leading-6 text-muted-foreground">Se usan solo para personalizar el plan; no se muestran en tu perfil público.</p>

          <div className="mt-5 space-y-5">
            <fieldset aria-describedby="gender-error">
              <legend className="mb-2 text-base font-semibold text-foreground">Sexo</legend>
              <div className="grid grid-cols-3 gap-2">
                {GENDERS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={answers.gender === value}
                    onClick={() => update('gender', value)}
                    className={cn(
                      'min-h-11 rounded-xl border-2 px-3 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
                      answers.gender === value ? 'border-violet-600 bg-violet-600 text-white' : 'border-border bg-card/60 text-foreground hover:border-violet-500/50',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {validation.errors.gender ? <p id="gender-error" className="mt-2 text-base text-red-600 dark:text-red-300">{validation.errors.gender}</p> : null}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label htmlFor="age" className="text-base font-semibold text-foreground">Edad</label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input id="age" name="age" type="number" min={18} max={100} value={answers.age} onChange={event => update('age', event.target.value)} placeholder="25" aria-describedby="age-error" aria-invalid={Boolean(validation.errors.age)} className={`${focusableControlClass} w-full pl-11`} />
                </div>
                {validation.errors.age ? <p id="age-error" className="text-base text-red-600 dark:text-red-300">{validation.errors.age}</p> : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="weight_kg" className="text-base font-semibold text-foreground">Peso (kg)</label>
                <div className="relative">
                  <Scale className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input id="weight_kg" name="weight_kg" type="number" min={30} max={300} value={answers.weight_kg} onChange={event => update('weight_kg', event.target.value)} placeholder="70" aria-describedby="weight-error" aria-invalid={Boolean(validation.errors.weight_kg)} className={`${focusableControlClass} w-full pl-11`} />
                </div>
                {validation.errors.weight_kg ? <p id="weight-error" className="text-base text-red-600 dark:text-red-300">{validation.errors.weight_kg}</p> : null}
              </div>

              <div className="space-y-2">
                <label htmlFor="height_cm" className="text-base font-semibold text-foreground">Altura (cm)</label>
                <div className="relative">
                  <Ruler className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input id="height_cm" name="height_cm" type="number" min={100} max={250} value={answers.height_cm} onChange={event => update('height_cm', event.target.value)} placeholder="175" aria-describedby="height-error" aria-invalid={Boolean(validation.errors.height_cm)} className={`${focusableControlClass} w-full pl-11`} />
                </div>
                {validation.errors.height_cm ? <p id="height-error" className="text-base text-red-600 dark:text-red-300">{validation.errors.height_cm}</p> : null}
              </div>
            </div>

          </div>
        </section>

        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="text-lg font-bold text-foreground">Resumen de tu perfil</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {summary.map(item => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card/60 p-4">
                  <Icon className="h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
                  <div>
                    <dt className="text-base font-semibold text-foreground">{item.label}</dt>
                    <dd className="text-base leading-6 text-muted-foreground">{item.value}</dd>
                  </div>
                </div>
              )
            })}
          </dl>
        </section>

        {professionalBlock ? (
          <div role="alert" className="flex gap-3 rounded-2xl border-2 border-amber-600/50 bg-amber-500/10 p-4 text-base leading-6 text-foreground">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <div>
              <p className="font-bold">La generación automática está bloqueada</p>
              <p className="mt-1">Antes de generar una rutina necesitas orientación o autorización de un profesional de salud cualificado. Puedes guardar tu perfil y crear el plan manualmente cuando corresponda.</p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-4 text-base leading-6 text-muted-foreground">
            La generación automática usa reglas versionadas y tus respuestas de seguridad. También puedes guardar el perfil y construir el plan manualmente.
          </div>
        )}
      </div>
    </StageShell>
  )
}
