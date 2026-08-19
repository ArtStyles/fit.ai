'use client'

import {
  Activity,
  Bike,
  CalendarDays,
  Gauge,
  Clock3,
  Footprints,
  Mountain,
  Repeat2,
  Route,
  Waves,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SESSION_DURATIONS, TRAINING_FREQUENCIES } from '@/lib/profile/trainingPreferences'
import type { OnboardingAnswers } from '@/app/onboarding/types'
import { canContinueStage } from './onboardingStages'
import { OptionButton, StageShell, type OnboardingStageProps } from './StageShell'

const CARDIO_OPTIONS = [
  { value: 'walking', label: 'Caminar', icon: Footprints },
  { value: 'running', label: 'Correr', icon: Route },
  { value: 'cycling', label: 'Bicicleta', icon: Bike },
  { value: 'elliptical', label: 'Elíptica', icon: Repeat2 },
  { value: 'rowing', label: 'Remo', icon: Waves },
  { value: 'stairs', label: 'Escaleras', icon: Mountain },
  { value: 'jump_rope', label: 'Cuerda', icon: Activity },
] as const

const ACTIVITY_LEVELS = [
  { value: 'inactive', label: 'Poca actividad', description: 'Casi ninguna actividad planificada', icon: Gauge },
  { value: 'insufficiently_active', label: 'Algo de actividad', description: 'Menos de 3 días por semana', icon: Footprints },
  { value: 'regularly_active', label: 'Actividad regular', description: '30 minutos moderados, al menos 3 días por semana', icon: Activity },
] as const

export function AvailabilityStage({ answers, update, current, total, onBack, onNext }: OnboardingStageProps) {
  function toggleCardio(value: OnboardingAnswers['cardio_preferences'][number]) {
    update(
      'cardio_preferences',
      answers.cardio_preferences.includes(value)
        ? answers.cardio_preferences.filter(item => item !== value)
        : [...answers.cardio_preferences, value],
    )
  }

  return (
    <StageShell
      title="Tu ritmo, tu agenda"
      description="Define una frecuencia realista y las actividades que disfrutas. La constancia importa más que hacer demasiado de golpe."
      current={current}
      total={total}
      onBack={onBack}
      onNext={onNext}
      canContinue={canContinueStage('availability', answers)}
      nextLabel="Continuar con mi espacio"
    >
      <div className="space-y-9">
        <fieldset>
          <legend className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
            <CalendarDays className="h-5 w-5 text-violet-600" aria-hidden="true" />
            Días por semana
          </legend>
          <div className="grid grid-cols-5 gap-2">
            {TRAINING_FREQUENCIES.map(day => (
              <button
                key={day}
                type="button"
                aria-pressed={answers.days_per_week === day}
                onClick={() => update('days_per_week', day)}
                className={cn(
                  'min-h-12 rounded-xl border-2 text-lg font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
                  answers.days_per_week === day
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-border bg-card/60 text-foreground hover:border-violet-500/50',
                )}
              >
                {day}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
            <Clock3 className="h-5 w-5 text-violet-600" aria-hidden="true" />
            Duración por sesión
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SESSION_DURATIONS.map(duration => (
              <button
                key={duration}
                type="button"
                aria-pressed={answers.session_duration === duration}
                onClick={() => update('session_duration', duration)}
                className={cn(
                  'min-h-12 rounded-xl border-2 px-3 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
                  answers.session_duration === duration
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-border bg-card/60 text-foreground hover:border-violet-500/50',
                )}
              >
                {duration === 60 ? '1 hora' : duration === 90 ? '1 h 30' : `${duration} min`}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-lg font-bold text-foreground">Cardio que aceptarías</legend>
          <p className="mb-3 text-base leading-6 text-muted-foreground">Selecciona al menos una opción; solo usaremos modalidades compatibles con tu equipo y tus restricciones.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CARDIO_OPTIONS.map(option => {
              const selected = answers.cardio_preferences.includes(option.value)
              const Icon = option.icon
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCardio(option.value)}
                  className={cn(
                    'flex min-h-14 items-center gap-2 rounded-xl border-2 px-3 py-3 text-left text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
                    selected ? 'border-violet-600 bg-violet-500/10 text-violet-700 dark:text-violet-200' : 'border-border bg-card/60 text-foreground hover:border-violet-500/50',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {option.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-lg font-bold text-foreground">Actividad en los últimos 3 meses</legend>
          <p className="mb-3 text-base leading-6 text-muted-foreground">Esto ayuda a calibrar el punto de partida del plan.</p>
          <div className="grid gap-3 md:grid-cols-3">
            {ACTIVITY_LEVELS.map(option => (
              <OptionButton
                key={option.value}
                selected={answers.activity_level === option.value}
                onClick={() => update('activity_level', option.value)}
                icon={option.icon}
                label={option.label}
                description={option.description}
              />
            ))}
          </div>
        </fieldset>
      </div>
    </StageShell>
  )
}
