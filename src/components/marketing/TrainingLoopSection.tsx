import type { HomeContent } from '@/lib/marketing/homeContent'

type TrainingLoopSectionProps = {
  problem: HomeContent['problem']
  loop: HomeContent['loop']
}

export function TrainingLoopSection({ problem, loop }: TrainingLoopSectionProps) {
  return (
    <section id="como-funciona" aria-labelledby="training-loop-title" className="scroll-mt-24 border-b border-border/60 px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <div>
          <h2 id="training-loop-title" className="max-w-2xl text-balance font-display text-3xl font-bold leading-tight tracking-[-0.015em] text-foreground sm:text-4xl">
            {problem.title}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            {problem.body}
          </p>
        </div>
        <ol className="mt-9 grid gap-7 md:grid-cols-3 md:gap-8">
          {loop.map((step, index) => (
            <li key={step.title} className="border-t border-border pt-5">
              <span className="text-xs font-bold tracking-[0.16em] text-primary" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 font-display text-2xl font-bold leading-tight text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
