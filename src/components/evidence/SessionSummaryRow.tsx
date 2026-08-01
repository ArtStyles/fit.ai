import { ChevronRight } from 'lucide-react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { cn } from '@/lib/utils'

export type SessionSummaryMetric = {
  label: string
  value: string
}

export type SessionSummarySignal = {
  label: string
  tone: 'record' | 'success' | 'warning' | 'neutral'
}

const SIGNAL_CLASSES: Record<SessionSummarySignal['tone'], string> = {
  record: 'border-amber-500/25 bg-amber-500/10 text-amber-200',
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
  warning: 'border-orange-500/25 bg-orange-500/10 text-orange-200',
  neutral: 'border-border/60 bg-muted/20 text-muted-foreground',
}

export function SessionSummaryRow({
  href,
  dateLabel,
  title,
  context,
  metrics,
  signal,
  className,
}: {
  href: string
  dateLabel: string
  title: string
  context?: string | null
  metrics: SessionSummaryMetric[]
  signal?: SessionSummarySignal | null
  className?: string
}) {
  return (
    <PendingLink
      href={href}
      className={cn('group block border-t border-border/60 py-4 transition-colors hover:bg-violet-500/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400', className)}
      spinnerClassName="h-3.5 w-3.5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium capitalize text-muted-foreground">{dateLabel}</p>
          <p className="mt-1 font-display text-lg font-semibold text-foreground">{title}</p>
          {context ? <p className="mt-1 text-sm text-muted-foreground">{context}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {signal ? (
            <span className={cn('rounded-full border px-2 py-1 text-[11px] font-semibold', SIGNAL_CLASSES[signal.tone])}>
              {signal.label}
            </span>
          ) : null}
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {metrics.map(metric => (
          <div key={metric.label} className="flex items-baseline gap-1 text-xs">
            <dt className="text-muted-foreground">{metric.label}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{metric.value}</dd>
          </div>
        ))}
      </dl>
    </PendingLink>
  )
}
