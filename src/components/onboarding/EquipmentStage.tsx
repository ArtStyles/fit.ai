'use client'

import {
  Building2,
  CircleDot,
  Dumbbell,
  GitBranch,
  Grip,
  Home,
  Link2,
  Minus,
  RectangleHorizontal,
  Target,
  Waves,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { canContinueStage } from './onboardingStages'
import { OptionButton, StageShell, type OnboardingStageProps } from './StageShell'

const LOCATIONS = [
  { value: 'home_no_equipment', label: 'Casa sin equipo', description: 'Entrenamiento con peso corporal', icon: Home },
  { value: 'home_basic', label: 'Casa con equipo básico', description: 'Mancuernas, bandas u otros accesorios', icon: Dumbbell },
  { value: 'full_gym', label: 'Gimnasio completo', description: 'Máquinas, pesos libres y estaciones', icon: Building2 },
] as const

const EQUIPMENT_OPTIONS = [
  { value: 'dumbbells', label: 'Mancuernas', icon: Dumbbell },
  { value: 'barbell', label: 'Barra', icon: Minus },
  { value: 'bench', label: 'Banco', icon: RectangleHorizontal },
  { value: 'kettlebell', label: 'Kettlebell', icon: CircleDot },
  { value: 'resistance_bands', label: 'Bandas', icon: Waves },
  { value: 'cable_machine', label: 'Polea o cable', icon: GitBranch },
  { value: 'pull_up_bar', label: 'Barra de dominadas', icon: Grip },
  { value: 'trx', label: 'TRX', icon: Target },
] as const

export function EquipmentStage({ answers, update, current, total, onBack, onNext }: OnboardingStageProps) {
  function chooseLocation(value: typeof LOCATIONS[number]['value']) {
    update('gym_type', value)
    if (value === 'home_no_equipment') update('equipment', [])
  }

  function toggleEquipment(value: string) {
    update(
      'equipment',
      answers.equipment.includes(value)
        ? answers.equipment.filter(item => item !== value)
        : [...answers.equipment, value],
    )
  }

  const showEquipment = answers.gym_type === 'home_basic' || answers.gym_type === 'full_gym'

  return (
    <StageShell
      title="Dónde vas a entrenar"
      description="Elige tu espacio habitual. Si tienes equipo, selecciónalo para que el plan solo proponga ejercicios que puedas realizar."
      current={current}
      total={total}
      onBack={onBack}
      onNext={onNext}
      canContinue={canContinueStage('equipment', answers)}
      nextLabel="Continuar con seguridad"
    >
      <div className="space-y-9">
        <fieldset>
          <legend className="mb-3 text-lg font-bold text-foreground">Lugar de entrenamiento</legend>
          <div className="grid gap-3 md:grid-cols-3">
            {LOCATIONS.map(option => (
              <OptionButton
                key={option.value}
                selected={answers.gym_type === option.value}
                onClick={() => chooseLocation(option.value)}
                icon={option.icon}
                label={option.label}
                description={option.description}
              />
            ))}
          </div>
        </fieldset>

        {showEquipment ? (
          <fieldset className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.04] p-5 sm:p-6">
            <legend className="px-2 text-lg font-bold text-foreground">Equipo disponible</legend>
            <p className="mb-4 text-base leading-6 text-muted-foreground">Selecciona todo lo que puedas usar. Puedes continuar sin marcar equipo adicional.</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {EQUIPMENT_OPTIONS.map(option => {
                const selected = answers.equipment.includes(option.value)
                const Icon = option.icon
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleEquipment(option.value)}
                    className={cn(
                      'flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-4 text-center text-base font-semibold transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none',
                      selected
                        ? 'border-violet-600 bg-violet-500/10 text-violet-700 dark:text-violet-200'
                        : 'border-border bg-card/60 text-foreground hover:border-violet-500/50',
                    )}
                  >
                    <Icon className="h-6 w-6" aria-hidden="true" />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </fieldset>
        ) : answers.gym_type === 'home_no_equipment' ? (
          <div className="flex gap-3 rounded-2xl border border-violet-500/25 bg-violet-500/[0.06] p-4 text-base leading-6 text-muted-foreground">
            <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" aria-hidden="true" />
            Prepararemos opciones de peso corporal que no requieran material adicional.
          </div>
        ) : null}
      </div>
    </StageShell>
  )
}
