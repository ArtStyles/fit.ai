import { ShieldCheck } from 'lucide-react'
import type { HomeContent } from '@/lib/marketing/homeContent'

type SafetySectionProps = {
  content: HomeContent['safety']
}

export function SafetySection({ content }: SafetySectionProps) {
  return (
    <section className="border-b border-border/60 px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 rounded-card border border-border bg-surface-1 p-6 sm:flex-row sm:items-start sm:gap-7 sm:p-8">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-control border border-primary/30 bg-primary/10 text-primary">
          <ShieldCheck className="h-7 w-7" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-4xl">
            {content.title}
          </h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
            {content.body}
          </p>
        </div>
      </div>
    </section>
  )
}
