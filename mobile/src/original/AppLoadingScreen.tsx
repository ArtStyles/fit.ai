import { Loader2 } from 'lucide-react'
import { VekiraLogo } from '@/components/branding/VekiraLogo'
import { useI18n } from '@/components/i18n/I18nProvider'

export function AppLoadingScreen() {
  const { language } = useI18n()
  const english = language === 'en'

  return (
    <main
      className="mx-auto flex min-h-[calc(100svh-10rem)] w-full max-w-lg items-center justify-center px-6 py-12"
      aria-busy="true"
    >
      <div className="flex w-full max-w-xs flex-col items-center text-center" role="status" aria-live="polite" aria-atomic="true">
        <VekiraLogo className="flex-col gap-4" markClassName="h-16 w-16 rounded-2xl" wordmarkClassName="text-2xl" />
        <div className="mt-8 flex items-center gap-2.5 text-sm font-medium text-foreground">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-violet-400 motion-reduce:animate-none" />
          <p>{english ? 'Getting everything ready' : 'Preparando tu espacio'}</p>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {english ? 'Your training and progress, in one place.' : 'Tu entrenamiento y tu progreso, en un solo lugar.'}
        </p>
      </div>
    </main>
  )
}
