import { Languages, Save } from 'lucide-react'
import { updateLanguage } from '@/app/actions/settings'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { requireAppUserContext } from '@/lib/auth/server'
import { createTranslator, normalizeLanguage } from '@/lib/i18n'

export const metadata = { title: 'Idioma · FitAI' }

export default async function LanguageSettingsPage() {
  const { profile } = await requireAppUserContext()
  const language = normalizeLanguage(profile.language)
  const t = createTranslator(language)
  const options = [
    {
      value: 'es',
      title: t('Español'),
      description: t('Nombres, navegación, acciones y contenido de ejercicios en español.'),
    },
    {
      value: 'en',
      title: 'English',
      description: t('Navigation, actions, and exercise content in English.'),
    },
  ] as const

  return (
    <SettingsScreen
      title={t('Idioma')}
      subtitle={t('Contenido del catálogo y las rutinas')}
      backHref="/settings"
      backLabel={t('Ajustes')}
      icon={<Languages className="h-5 w-5" />}
    >
      <form action={updateLanguage} className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="sr-only">{t('Idioma de la aplicación')}</legend>
          {options.map(option => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border/60 bg-muted/10 p-4 has-[:checked]:border-violet-500/60 has-[:checked]:bg-violet-500/10"
            >
              <input
                type="radio"
                name="language"
                value={option.value}
                defaultChecked={(profile.language ?? 'es') === option.value}
                className="mt-1 h-4 w-4 accent-violet-500"
              />
              <span>
                <span className="block text-sm font-semibold text-foreground">{option.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('Este ajuste cambia la interfaz completa y el contenido técnico de los ejercicios.')}
        </p>

        <SubmitButton
          label={t('Guardar idioma')}
          pendingLabel={t('Guardando')}
          className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600"
        >
          <Save className="mr-2 h-4 w-4" />
          {t('Guardar idioma')}
        </SubmitButton>
      </form>
    </SettingsScreen>
  )
}
