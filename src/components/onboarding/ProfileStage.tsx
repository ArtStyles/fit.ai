'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  AtSign,
  CheckCircle2,
  Dumbbell,
  Flame,
  HeartPulse,
  Loader2,
  Medal,
  ShieldCheck,
  Sprout,
  UserRound,
  Zap,
} from 'lucide-react'
import { checkUsernameAvailable, updateUsername } from '@/app/actions/username'
import { validateUsername } from '@/lib/social/username'
import { canContinueStage } from './onboardingStages'
import { focusableControlClass, OptionButton, StageShell, type OnboardingStageProps } from './StageShell'

const GOALS = [
  { value: 'lose_weight', label: 'Perder grasa', description: 'Reducir grasa corporal', icon: Flame },
  { value: 'build_muscle', label: 'Ganar músculo', description: 'Hipertrofia y volumen', icon: Dumbbell },
  { value: 'gain_strength', label: 'Ganar fuerza', description: 'Levantar más peso', icon: Zap },
  { value: 'stay_active', label: 'Mantenerme activo', description: 'Fitness general y salud', icon: HeartPulse },
  { value: 'improve_endurance', label: 'Mejorar resistencia', description: 'Cardio y aguante', icon: Activity },
] as const

const LEVELS = [
  { value: 'beginner', label: 'Principiante', description: 'Menos de 6 meses entrenando', icon: Sprout },
  { value: 'intermediate', label: 'Intermedio', description: 'Entre 6 meses y 2 años', icon: ShieldCheck },
  { value: 'advanced', label: 'Avanzado', description: 'Más de 2 años', icon: Medal },
] as const

export function ProfileStage({ answers, update, current, total, onNext }: OnboardingStageProps) {
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    const id = ++requestId.current
    const validation = validateUsername(answers.username)
    setAvailable(null)
    if (!validation.ok) {
      setError(answers.username ? validation.error : null)
      setChecking(false)
      return
    }

    setError(null)
    setChecking(true)
    const timeout = setTimeout(async () => {
      const result = await checkUsernameAvailable(validation.value)
      if (id !== requestId.current) return
      setAvailable(result.available)
      setError(result.available ? null : result.error ?? 'Ese nombre de usuario ya está en uso.')
      setChecking(false)
    }, 350)

    return () => clearTimeout(timeout)
  }, [answers.username])

  const canContinue = canContinueStage('profile', answers, available === true) && !checking && !saving

  async function handleNext() {
    setSaving(true)
    const result = await updateUsername(answers.username)
    setSaving(false)
    if (result.ok) onNext()
    else setError(result.error)
  }

  return (
    <StageShell
      title="Empecemos por ti"
      description="Cuéntanos cómo llamarte y qué quieres conseguir. Usaremos estos datos para adaptar la experiencia desde el primer día."
      current={current}
      total={total}
      onBack={null}
      onNext={handleNext}
      canContinue={canContinue}
      nextBusy={saving}
      nextLabel={saving ? 'Guardando perfil…' : 'Continuar con mi disponibilidad'}
    >
      <div className="space-y-8">
        <section className="grid gap-5 rounded-3xl border border-violet-500/20 bg-violet-500/[0.04] p-5 sm:grid-cols-2 sm:p-6" aria-labelledby="identity-heading">
          <div className="sm:col-span-2">
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <UserRound className="h-5 w-5" aria-hidden="true" />
              <h2 id="identity-heading" className="text-lg font-bold">Tu identidad</h2>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="full_name" className="text-base font-semibold text-foreground">Nombre completo</label>
            <input
              id="full_name"
              name="full_name"
              autoComplete="name"
              value={answers.full_name}
              onChange={event => update('full_name', event.target.value)}
              placeholder="Tu nombre"
              className={`${focusableControlClass} w-full`}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="username" className="text-base font-semibold text-foreground">Nombre de usuario</label>
            <div className="relative">
              <AtSign className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="username"
                name="username"
                autoCapitalize="none"
                autoComplete="username"
                maxLength={20}
                value={answers.username}
                onChange={event => update('username', event.target.value)}
                placeholder="tu_usuario"
                aria-describedby="username-status"
                aria-invalid={Boolean(error)}
                className={`${focusableControlClass} w-full pl-11 pr-11`}
              />
              {checking ? <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="Comprobando disponibilidad" /> : null}
              {!checking && available ? <CheckCircle2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-600" aria-hidden="true" /> : null}
            </div>
            <p id="username-status" className={`text-base ${error ? 'text-red-600 dark:text-red-300' : 'text-muted-foreground'}`} aria-live="polite">
              {error ?? (available ? 'Nombre disponible.' : 'Entre 3 y 20 caracteres; usa letras, números o guion bajo.')}
            </p>
          </div>
        </section>

        <fieldset>
          <legend className="mb-3 text-lg font-bold text-foreground">Objetivo principal</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {GOALS.map(option => (
              <OptionButton
                key={option.value}
                selected={answers.goal === option.value}
                onClick={() => update('goal', option.value)}
                icon={option.icon}
                label={option.label}
                description={option.description}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-lg font-bold text-foreground">Nivel de experiencia</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {LEVELS.map(option => (
              <OptionButton
                key={option.value}
                selected={answers.fitness_level === option.value}
                onClick={() => update('fitness_level', option.value)}
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
