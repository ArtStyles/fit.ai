import { Dumbbell, Save } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { SelectField, GOALS, LEVELS, GYMS, DAY_OPTIONS } from '@/components/settings/fields'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { requireAppUserContext } from '@/lib/auth/server'
import { updateTrainingSettings } from '@/app/actions/settings'

export const metadata = { title: 'Entrenamiento · FitAI' }

type TrainingProfile = {
  fitness_level: string | null
  primary_goal: string | null
  days_per_week: number | null
  session_duration_minutes: number | null
  gym_type: string | null
  available_equipment: string[] | null
  injuries: string | null
  preferred_workout_days: number[] | null
}

export default async function TrainingSettingsPage() {
  const { supabase, user } = await requireAppUserContext()

  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      fitness_level,
      primary_goal,
      days_per_week,
      session_duration_minutes,
      gym_type,
      available_equipment,
      injuries,
      preferred_workout_days
    `)
    .eq('id', user.id)
    .single() as unknown as { data: TrainingProfile | null }

  const selectedDays = new Set(profile?.preferred_workout_days ?? [])

  return (
    <SettingsScreen
      title="Entrenamiento"
      backHref="/settings"
      backLabel="Ajustes"
      icon={<Dumbbell className="h-5 w-5" />}
    >
      <form action={updateTrainingSettings} className="space-y-6">
        <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
          <div className="space-y-3">
            <SelectField label="Objetivo" name="primaryGoal" value={profile?.primary_goal ?? null} options={GOALS} />
            <SelectField label="Nivel" name="fitnessLevel" value={profile?.fitness_level ?? null} options={LEVELS} />
            <SelectField label="Gimnasio" name="gymType" value={profile?.gym_type ?? null} options={GYMS} />

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Días/semana</span>
                <input
                  name="daysPerWeek"
                  type="number"
                  min={2}
                  max={6}
                  defaultValue={profile?.days_per_week ?? ''}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Min/sesión</span>
                <input
                  name="sessionDurationMinutes"
                  type="number"
                  min={20}
                  max={120}
                  defaultValue={profile?.session_duration_minutes ?? ''}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Días preferidos</span>
              <div className="grid grid-cols-7 gap-1.5">
                {DAY_OPTIONS.map(day => (
                  <label
                    key={day.value}
                    className="flex h-10 items-center justify-center rounded-md border border-border/60 bg-background text-sm font-semibold text-foreground has-[:checked]:border-violet-500 has-[:checked]:bg-violet-500/15 has-[:checked]:text-violet-200"
                  >
                    <input
                      type="checkbox"
                      name="preferredWorkoutDays"
                      value={day.value}
                      defaultChecked={selectedDays.has(day.value)}
                      className="sr-only"
                    />
                    {day.label}
                  </label>
                ))}
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Equipo disponible</span>
              <input
                name="availableEquipment"
                defaultValue={(profile?.available_equipment ?? []).join(', ')}
                placeholder="mancuernas, barra, polea"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Lesiones o limitaciones</span>
              <textarea
                name="injuries"
                rows={3}
                defaultValue={profile?.injuries ?? ''}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
              />
            </label>
          </div>
        </section>

        <SubmitButton
          label="Guardar"
          pendingLabel="Guardando"
          className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600"
        >
          <Save className="mr-2 h-4 w-4" />
          Guardar
        </SubmitButton>
      </form>
    </SettingsScreen>
  )
}
