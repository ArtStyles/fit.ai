import { Cloud, WifiOff } from 'lucide-react'
import type { PublicLocale } from '@/lib/i18n/routing'
import type { HomeContent } from '@/lib/marketing/homeContent'

type SafetySectionProps = {
  content: HomeContent['safety']
  locale: PublicLocale
}

export function SafetySection({ content, locale }: SafetySectionProps) {
  const copy = locale === 'es'
    ? {
        eyebrow: 'Contigo, también sin conexión',
        title: 'Entrena a tu ritmo. También sin conexión.',
        body: 'Tu entrenamiento personal funciona sin internet. Lleva tu rutina y registra tus sesiones en Android, también cuando el gimnasio se queda sin señal.',
        connectedTitle: 'Conéctate cuando lo necesites',
        connectedBody: 'Sincroniza tus sesiones, comparte tus avances o conecta con entrenadores cuando tengas internet.',
      }
    : {
        eyebrow: 'With you, even offline',
        title: 'Train at your pace. Even when you are offline.',
        body: 'Your personal training works without internet. Take your routine and log your workouts on Android, even when the gym has no signal.',
        connectedTitle: 'Connect when you need to',
        connectedBody: 'Sync your workouts, share your progress, or connect with trainers when you have internet access.',
      }

  return (
    <section aria-labelledby="offline-title" className="px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <div className="grid items-center gap-9 lg:grid-cols-[1.5fr_1fr] lg:gap-20">
          <div data-reveal>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
              {copy.eyebrow}
            </p>
            <h2 id="offline-title" className="mt-4 max-w-2xl text-balance font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-4xl">
              {copy.title}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{copy.body}</p>
          </div>
          <div data-reveal className="border-l border-primary/30 pl-6 sm:pl-8">
            <Cloud className="mb-4 h-7 w-7 text-primary" aria-hidden />
            <h3 className="font-display text-xl font-bold leading-tight text-foreground">{copy.connectedTitle}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.connectedBody}</p>
          </div>
        </div>
        <p data-reveal className="mt-9 max-w-4xl border-t border-border/60 pt-5 text-xs leading-6 text-muted-foreground">{content.body}</p>
      </div>
    </section>
  )
}
