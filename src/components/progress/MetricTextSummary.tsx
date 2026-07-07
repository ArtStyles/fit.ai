import { cn } from '@/lib/utils'

export function MetricTextSummary({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      aria-live="polite"
      className={cn(
        'mt-3 rounded-xl border border-border/40 bg-background/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  )
}
