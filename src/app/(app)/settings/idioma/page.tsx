import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { requireAppUserContext } from '@/lib/auth/server'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'
import { LanguageSelector } from './LanguageSelector'

export const metadata = { title: 'Idioma · Vekira' }

export default async function LanguageSettingsPage() {
  const { profile } = await requireAppUserContext()
  const language = normalizeLanguage(profile.language)
  const t = createTranslator(language)
  const options = [
    {
      value: 'es',
      title: 'Español',
      description: t('Interfaz en español'),
    },
    {
      value: 'en',
      title: 'English',
      description: t('Interfaz en inglés'),
    },
  ] as const

  return (
    <SettingsScreen
      title={t('Idioma')}
      eyebrow={t('Aplicación')}
      description={t('Este ajuste cambia la interfaz completa y el contenido técnico de los ejercicios.')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon="languages"
    >
      <LanguageSelector
        currentLanguage={language}
        legend={t('Idioma de la aplicación')}
        options={options}
        feedbackCopy={{
          saving: t('Guardando idioma…'),
          saved: t('Idioma guardado.'),
          error: t('No se pudo guardar el idioma.'),
        }}
      />
    </SettingsScreen>
  )
}
