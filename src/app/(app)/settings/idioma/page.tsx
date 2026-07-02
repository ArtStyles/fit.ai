import { Languages } from 'lucide-react'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { requireAppUserContext } from '@/lib/auth/server'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'
import { LanguageSelector } from './LanguageSelector'

export const metadata = { title: 'Idioma · FitAI' }

export default async function LanguageSettingsPage() {
  const { profile } = await requireAppUserContext()
  const language = normalizeLanguage(profile.language)
  const t = createTranslator(language)
  const options = [
    {
      value: 'es',
      title: t('Español'),
    },
    {
      value: 'en',
      title: 'English',
    },
  ] as const

  return (
    <SettingsScreen
      title={t('Idioma')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon={<Languages className="h-5 w-5" />}
    >
      <LanguageSelector
        currentLanguage={language}
        legend={t('Idioma de la aplicación')}
        options={options}
      />
    </SettingsScreen>
  )
}
