import { cn } from '@/lib/utils'

type AdminMetricTone = 'neutral' | 'violet' | 'warning' | 'danger'

type AdminMetricCardProps = {
  label: string
  value: number | null
  detail?: string
  tone?: AdminMetricTone
}

const toneClasses: Record<AdminMetricTone, string> = {
  neutral: 'border-border/60 text-foreground',
  violet: 'border-violet-500/30 text-violet-100',
  warning: 'border-amber-500/30 text-amber-100',
  danger: 'border-red-500/30 text-red-100',
}

export function AdminMetricCard({ label, value, detail, tone = 'neutral' }: AdminMetricCardProps) {
  return (
    <article className={cn('rounded-2xl border bg-card/60 p-4', toneClasses[tone])}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-3 font-display text-3xl font-bold">{value === null ? 'No disponible' : value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </article>
  )
}
