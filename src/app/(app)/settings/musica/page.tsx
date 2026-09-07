import { MusicIntegrationSettings } from '@/components/settings/MusicIntegrationSettings'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { requireAppUserContext } from '@/lib/auth/server'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

export const metadata = { title: 'Integración musical · Vekira' }

export default async function MusicSettingsPage() {
  const { profile } = await requireAppUserContext()
  const t = createTranslator(normalizeLanguage(profile.language))

  return (
    <SettingsScreen
      title={t('Integración musical')}
      eyebrow={t('Aplicación')}
      description={t('Reproductor del sistema Android')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon="music-2"
    >
      <MusicIntegrationSettings />
    </SettingsScreen>
  )
}
