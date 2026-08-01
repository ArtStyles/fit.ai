import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EvidenceInsightTone = 'neutral' | 'success' | 'warning' | 'active'

const TONE_CLASSES: Record<EvidenceInsightTone, string> = {
  neutral: 'border-border/60 bg-muted/10 text-muted-foreground',
  success: 'border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-200',
  warning: 'border-orange-500/20 bg-orange-500/[0.07] text-orange-200',
  active: 'border-violet-500/20 bg-violet-500/[0.07] text-violet-100',
}

const TONE_ICONS = {
  neutral: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  active: Sparkles,
} as const

export function EvidenceInsight({
  title,
  children,
  tone = 'neutral',
  className,
}: {
  title: string
  children: ReactNode
  tone?: EvidenceInsightTone
  className?: string
}) {
  const Icon = TONE_ICONS[tone]

  return (
    <aside data-evidence-tone={tone} className={cn('rounded-2xl border p-4', TONE_CLASSES[tone], className)}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <div className="mt-1 text-sm leading-relaxed">{children}</div>
        </div>
      </div>
    </aside>
  )
}
