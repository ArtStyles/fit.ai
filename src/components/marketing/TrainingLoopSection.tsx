import type { HomeContent } from '@/lib/marketing/homeContent'

type TrainingLoopSectionProps = {
  problem: HomeContent['problem']
  loop: HomeContent['loop']
}

export function TrainingLoopSection({ problem, loop }: TrainingLoopSectionProps) {
  return (
    <section id="como-funciona" aria-labelledby="training-loop-title" className="scroll-mt-28 px-5 py-12 sm:px-8 sm:py-16 lg:px-12">
      <div className="mx-auto w-full max-w-6xl">
        <div data-reveal className="grid items-end gap-4 lg:grid-cols-[1.2fr_1fr] lg:gap-14">
          <h2 id="training-loop-title" className="max-w-2xl text-balance font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-4xl">
            {problem.title}
          </h2>
          <p className="max-w-xl text-base leading-7 text-muted-foreground">
            {problem.body}
          </p>
        </div>
        <ol className="mt-8 grid gap-5 md:mt-10 md:grid-cols-3 md:gap-8">
          {loop.map((step, index) => (
            <li key={step.title} data-reveal className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3 border-t border-border/70 pt-4 md:block md:pt-5 [&:nth-child(2)]:ml-3 [&:nth-child(3)]:ml-6 md:[&:nth-child(2)]:ml-0 md:[&:nth-child(3)]:ml-0">
              <span className="font-display text-5xl font-medium leading-none tracking-[-0.06em] text-primary/80 md:text-6xl" aria-hidden>
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-display text-xl font-bold leading-tight text-foreground md:mt-4 md:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
