import { Languages, Save } from 'lucide-react'
import { updateLanguage } from '@/app/actions/settings'
import { SubmitButton } from '@/components/feedback/SubmitButton'
import { SettingsScreen } from '@/components/settings/SettingsScreen'
import { requireAppUserContext } from '@/lib/auth/server'

export const metadata = { title: 'Idioma · FitAI' }

const OPTIONS = [
  {
    value: 'es',
    title: 'Español',
    description: 'Nombres, músculos, equipo e instrucciones de ejercicios en español.',
  },
  {
    value: 'en',
    title: 'English',
    description: 'Exercise names, muscles, equipment, and instructions in English.',
  },
] as const

export default async function LanguageSettingsPage() {
  const { profile } = await requireAppUserContext()

  return (
    <SettingsScreen
      title="Idioma"
      subtitle="Contenido del catálogo y las rutinas"
      backHref="/settings"
      backLabel="Ajustes"
      icon={<Languages className="h-5 w-5" />}
    >
      <form action={updateLanguage} className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="sr-only">Idioma de los ejercicios</legend>
          {OPTIONS.map(option => (
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
          La interfaz general permanece en español. Este ajuste controla el contenido técnico de los ejercicios en toda la app.
        </p>

        <SubmitButton
          label="Guardar idioma"
          pendingLabel="Guardando"
          className="h-11 w-full bg-violet-500 text-white hover:bg-violet-600"
        >
          <Save className="mr-2 h-4 w-4" />
          Guardar idioma
        </SubmitButton>
      </form>
    </SettingsScreen>
  )
}
