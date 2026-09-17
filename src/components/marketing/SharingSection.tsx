import { CalendarCheck, HandHeart, LockKeyhole, QrCode, UsersRound, Wifi } from 'lucide-react'
import type { HomeContent } from '@/lib/marketing/homeContent'

export function SharingSection({ content }: { content: HomeContent['sharing'] }) {
  const companionIcons = [CalendarCheck, HandHeart, UsersRound]

  return (
    <section id="compartir" aria-labelledby="sharing-title" className="px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <div data-reveal className="mb-8 max-w-2xl sm:mb-10">
          <p className="landing-eyebrow">{content.eyebrow}</p>
          <h2 id="sharing-title" className="mt-4 text-balance font-display text-4xl font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-5xl">
            {content.title}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">{content.body}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
          <article data-reveal aria-labelledby="fitness-card-title" className="flex flex-col rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-500/[0.12] to-transparent p-6 sm:p-8 lg:p-10">
            <div className="flex items-center gap-3 text-violet-300">
              <QrCode className="h-6 w-6 shrink-0" aria-hidden />
              <h3 id="fitness-card-title" className="text-sm font-bold tracking-wide">{content.fitnessCard.label}</h3>
            </div>
            <p className="mt-6 max-w-sm text-balance font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">{content.fitnessCard.title}</p>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{content.fitnessCard.body}</p>
            <ol className="my-7 space-y-4 border-l border-violet-300/25 pl-5">
              {content.fitnessCard.steps.map((step, index) => (
                <li key={step} className="flex items-baseline gap-3 text-sm leading-6 text-foreground">
                  <span aria-hidden className="text-xs font-semibold tabular-nums text-violet-300">{String(index + 1).padStart(2, '0')}</span>
                  {step}
                </li>
              ))}
            </ol>
            <p className="mt-auto flex items-start gap-3 border-t border-violet-300/15 pt-5 text-sm leading-6 text-muted-foreground">
              <LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-violet-300" aria-hidden />
              {content.fitnessCard.privacy}
            </p>
          </article>

          <article data-reveal aria-labelledby="companion-title" className="flex flex-col rounded-3xl border border-border bg-white/[0.02] p-6 sm:p-8 lg:p-10">
            <div className="flex items-center gap-3 text-violet-300">
              <UsersRound className="h-6 w-6 shrink-0" aria-hidden />
              <h3 id="companion-title" className="text-sm font-bold tracking-wide">{content.companion.label}</h3>
            </div>
            <p className="mt-6 max-w-md text-balance font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">{content.companion.title}</p>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{content.companion.body}</p>
            <ul className="my-7 space-y-4">
              {content.companion.details.map((detail, index) => {
                const Icon = companionIcons[index] ?? HandHeart
                return <li key={detail} className="flex items-start gap-3 text-sm leading-6 text-foreground"><Icon className="mt-1 h-4 w-4 shrink-0 text-violet-300" aria-hidden />{detail}</li>
              })}
            </ul>
            <p className="mt-auto flex items-start gap-3 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">
              <LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-violet-300" aria-hidden />
              {content.companion.privacy}
            </p>
          </article>
        </div>
        <p data-reveal className="mt-6 flex max-w-3xl items-start gap-3 text-xs leading-6 text-muted-foreground"><Wifi className="mt-1 h-4 w-4 shrink-0" aria-hidden />{content.connection}</p>
      </div>
    </section>
  )
}
