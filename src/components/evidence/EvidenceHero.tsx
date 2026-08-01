import type { ReactNode } from 'react'

export function EvidenceHero({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  action?: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="rounded-3xl border border-violet-500/20 bg-violet-500/[0.06] p-5 shadow-lg shadow-violet-950/10 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-300">{eyebrow}</p>
          <h2 className="mt-2 font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  )
}
