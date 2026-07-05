import type { HomeContent } from '@/lib/marketing/homeContent'

type TrainingLoopSectionProps = {
  problem: HomeContent['problem']
  loop: HomeContent['loop']
}

export function TrainingLoopSection({ problem, loop }: TrainingLoopSectionProps) {
  return (
    <section id="como-funciona" className="scroll-mt-24 border-b border-border/60 px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
      <div className="mx-auto grid w-full max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <div>
          <h2 className="max-w-xl font-display text-4xl font-black leading-none tracking-[-0.025em] text-foreground sm:text-5xl">
            {problem.title}
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            {problem.body}
          </p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2">
          {loop.map((step, index) => (
            <li key={step.title} className="bg-surface-1 p-6 sm:min-h-52 sm:p-8">
              <span className="font-display text-2xl font-black text-primary" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-8 font-display text-2xl font-bold leading-tight text-foreground">
                {step.title}
              </h3>
              <p className="mt-3 leading-7 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
