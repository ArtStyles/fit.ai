import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { PersonalDataForm } from '@/components/settings/PersonalDataForm'
import { requireAppUserContext } from '@/lib/auth/server'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'
import type { PersonalDataGender } from '@/lib/profile/personalData'

export const metadata = { title: 'Datos personales · Vekira' }

type PersonalProfile = {
  height_cm: number | null
  date_of_birth: string | null
  gender: PersonalDataGender | null
}

export default async function PersonalDataPage() {
  const { supabase, user, profile: appProfile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(appProfile.language))

  const { data: profile } = await supabase
    .from('profiles')
    .select('height_cm, date_of_birth, gender')
    .eq('id', user.id)
    .single() as unknown as { data: PersonalProfile | null }

  return (
    <SettingsScreen
      title={t('Datos personales')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon="user-round"
    >
      <PersonalDataForm
        initial={{
          heightCm: profile?.height_cm ?? null,
          dateOfBirth: profile?.date_of_birth ?? null,
          gender: profile?.gender ?? null,
        }}
        currentWeightKg={appProfile.weight_kg}
      />
    </SettingsScreen>
  )
}
