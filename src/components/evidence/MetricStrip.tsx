import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type MetricStripItem = {
  label: string
  value: ReactNode
  detail?: ReactNode
}

export function MetricStrip({ items, className }: { items: MetricStripItem[]; className?: string }) {
  return (
    <dl
      data-evidence-metrics
      className={cn(
        'grid gap-3',
        items.length === 4
          ? 'sm:grid-cols-2 lg:grid-cols-4'
          : items.length === 2
            ? 'sm:grid-cols-2'
            : 'sm:grid-cols-3',
        className,
      )}
    >
      {items.map(item => (
        <div key={item.label} className="min-w-0 border-t border-border/60 pt-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-foreground">{item.value}</dd>
          {item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}
        </div>
      ))}
    </dl>
  )
}
