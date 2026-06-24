import { Save, UserRound } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { SelectField, GENDERS } from '@/components/settings/fields'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { requireAppUserContext } from '@/lib/auth/server'
import { updatePersonalData } from '@/app/actions/settings'

export const metadata = { title: 'Datos personales · FitAI' }

type PersonalProfile = {
  height_cm: number | null
  weight_kg: number | null
  date_of_birth: string | null
  gender: string | null
}

export default async function PersonalDataPage() {
  const { supabase, user } = await requireAppUserContext()

  const { data: profile } = await supabase
    .from('profiles')
    .select('height_cm, weight_kg, date_of_birth, gender')
    .eq('id', user.id)
    .single() as unknown as { data: PersonalProfile | null }

  return (
    <SettingsScreen
      title="Datos personales"
      backHref="/settings"
      backLabel="Ajustes"
      icon={<UserRound className="h-5 w-5" />}
    >
      <form action={updatePersonalData} className="space-y-6">
        <section className="rounded-2xl border border-border/60 bg-muted/10 p-5">
          <div className="space-y-3">
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
