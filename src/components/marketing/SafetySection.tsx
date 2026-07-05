import { ShieldCheck } from 'lucide-react'
import type { HomeContent } from '@/lib/marketing/homeContent'

type SafetySectionProps = {
  content: HomeContent['safety']
}

export function SafetySection({ content }: SafetySectionProps) {
  return (
    <section className="border-b border-border/60 px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 rounded-card border border-border bg-surface-1 p-7 sm:p-10 lg:flex-row lg:items-center lg:gap-14 lg:p-14">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-control border border-primary/30 bg-primary/10 text-primary">
          <ShieldCheck className="h-7 w-7" aria-hidden />
        </span>
        <div>
          <h2 className="font-display text-4xl font-black leading-none tracking-[-0.025em] text-foreground sm:text-5xl">
            {content.title}
          </h2>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {content.body}
          </p>
        </div>
      </div>
    </section>
  )
}
