import { ChevronDown } from 'lucide-react'
import type { HomeContent } from '@/lib/marketing/homeContent'

type MarketingFaqProps = {
  title: HomeContent['faqTitle']
  items: HomeContent['faq']
}

export function MarketingFaq({ title, items }: MarketingFaqProps) {
  return (
    <section id="ayuda" aria-labelledby="faq-title" className="landing-faq px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
      <div data-reveal className="mx-auto grid w-full max-w-6xl gap-7 lg:grid-cols-[0.65fr_1fr] lg:gap-20">
        <h2 id="faq-title" className="max-w-sm font-display text-4xl font-bold leading-[1.05] tracking-[-0.025em] text-foreground sm:text-5xl lg:text-6xl">
          {title}
        </h2>
        <div className="border-t border-white/15">
          {items.map((item, index) => (
            <details key={item.question} className="landing-question group border-b border-white/15">
              <summary className="flex min-h-20 cursor-pointer list-none items-center gap-4 px-1 py-5 outline-none transition-colors duration-200 hover:text-violet-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="text-[10px] tabular-nums text-violet-300">{String(index + 1).padStart(2, '0')}</span>
                <h3 className="flex flex-1 items-center justify-between gap-4 font-display text-xl font-bold leading-tight sm:text-2xl">
                  {item.question}
                  <ChevronDown className="h-5 w-5 shrink-0 text-primary transition-transform duration-200 group-open:rotate-180" aria-hidden />
                </h3>
              </summary>
              <p className="max-w-3xl pb-6 pl-8 pr-6 text-sm leading-7 text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
