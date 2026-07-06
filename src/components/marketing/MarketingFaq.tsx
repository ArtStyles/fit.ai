import { ChevronDown } from 'lucide-react'
import type { HomeContent } from '@/lib/marketing/homeContent'

type MarketingFaqProps = {
  title: HomeContent['faqTitle']
  items: HomeContent['faq']
}

export function MarketingFaq({ title, items }: MarketingFaqProps) {
  return (
    <section className="border-b border-border/60 px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
      <div className="mx-auto w-full max-w-4xl">
        <h2 className="mb-10 font-display text-4xl font-black leading-none tracking-[-0.025em] text-foreground sm:text-5xl">
          {title}
        </h2>
        <div className="space-y-3">
          {items.map(item => (
            <details key={item.question} className="group rounded-card border border-border bg-surface-1">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 rounded-card px-5 py-4 outline-none transition-colors duration-200 hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <h3 className="flex flex-1 items-center justify-between gap-4 font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
                  {item.question}
                  <ChevronDown className="h-5 w-5 shrink-0 text-primary transition-transform duration-200 group-open:rotate-180" aria-hidden />
                </h3>
              </summary>
              <p className="max-w-3xl px-5 pb-6 pr-12 leading-7 text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
