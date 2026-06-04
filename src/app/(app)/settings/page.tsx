import Link from 'next/link'
import { ArrowLeft, LogOut, Save, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { WorkoutReminders } from '@/components/settings/WorkoutReminders'
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection'
import { PendingLink } from '@/components/navigation/PendingLink'
import { requireAppUserContext } from '@/lib/auth/server'
import { signOut } from '@/app/(auth)/actions'
import { updateSettings } from '@/app/actions/settings'

export const metadata = { title: 'Ajustes · FitAI' }

const DAY_OPTIONS = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'X' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
  { value: 6, label: 'S' },
  { value: 7, label: 'D' },
]

const GOALS = [
  ['build_muscle', 'Ganar músculo'],
  ['gain_strength', 'Ganar fuerza'],
  ['lose_weight', 'Perder peso'],
  ['improve_endurance', 'Mejorar resistencia'],
  ['stay_active', 'Mantenerse activo'],
  ['other', 'Otro'],
]

const LEVELS = [
  ['beginner', 'Principiante'],
  ['intermediate', 'Intermedio'],
  ['advanced', 'Avanzado'],
]

const GYMS = [
  ['home_no_equipment', 'Casa sin equipo'],
  ['home_basic', 'Casa con equipo básico'],
  ['full_gym', 'Gimnasio completo'],
]

const GENDERS = [
  ['male', 'Masculino'],
  ['female', 'Femenino'],
  ['other', 'Otro'],
  ['prefer_not_to_say', 'Prefiero no decir'],
]

type FullProfile = {
  full_name: string | null
  height_cm: number | null
  weight_kg: number | null
  date_of_birth: string | null
  gender: string | null
  fitness_level: string | null
  primary_goal: string | null
  days_per_week: number | null
  session_duration_minutes: number | null
  gym_type: string | null
  available_equipment: string[] | null
  injuries: string | null
  preferred_workout_days: number[] | null
}

function SelectField({
  label,
  name,
  value,
  options,
}: {
  label: string
  name: string
  value: string | null
  options: string[][]
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
      >
        <option value="">Sin definir</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  )
}

export default async function SettingsPage() {
  const { supabase, user } = await requireAppUserContext()

  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      full_name,
      height_cm,
      weight_kg,
      date_of_birth,
      gender,
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
    .single() as unknown as { data: FullProfile | null }

  const selectedDays = new Set(profile?.preferred_workout_days ?? [])

  return (
    <div className="min-h-screen bg-background pb-16">
      <main className="mx-auto max-w-lg px-4 py-8">
        <PendingLink
          href="/dashboard"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
          showSpinner={false}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Dashboard
        </PendingLink>

        <header className="mt-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Ajustes</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </header>

        <form action={updateSettings} className="mt-8 space-y-6">
          <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
            <p className="text-sm font-semibold text-foreground">Perfil</p>
            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Nombre</span>
                <input
                  name="fullName"
                  defaultValue={profile?.full_name ?? ''}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Altura cm</span>
                  <input
                    name="heightCm"
                    type="number"
                    min={90}
                    max={240}
                    defaultValue={profile?.height_cm ?? ''}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Peso kg</span>
                  <input
                    name="weightKg"
                    type="number"
                    step="0.1"
                    min={30}
                    max={300}
                    defaultValue={profile?.weight_kg ?? ''}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Nacimiento</span>
                  <input
                    name="dateOfBirth"
                    type="date"
                    defaultValue={profile?.date_of_birth ?? ''}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </label>
                <SelectField label="Género" name="gender" value={profile?.gender ?? null} options={GENDERS} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
            <p className="text-sm font-semibold text-foreground">Entrenamiento</p>
            <div className="mt-4 space-y-3">
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
            label="Guardar ajustes"
            pendingLabel="Guardando ajustes"
            className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600"
          >
            <Save className="mr-2 h-4 w-4" />
            Guardar ajustes
          </SubmitButton>
        </form>

        <div className="mt-6">
          <WorkoutReminders preferredWorkoutDays={profile?.preferred_workout_days ?? []} />
        </div>

        <form action={signOut} className="mt-4">
          <Button
            type="submit"
            variant="outline"
            className="h-11 w-full border-border/60 bg-transparent text-muted-foreground hover:bg-muted/20 hover:text-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </form>

        <div className="mt-8">
          <DeleteAccountSection />
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link href="/privacy" className="underline transition-colors hover:text-foreground">
            Política de privacidad
          </Link>
        </p>
      </main>
    </div>
  )
}
