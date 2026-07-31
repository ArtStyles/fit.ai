import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type TimelineTone = 'completed' | 'active' | 'rest' | 'upcoming' | 'missed'

export function TimelineRail({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ol
      className={cn(
        'relative space-y-3 before:absolute before:bottom-5 before:left-[0.4375rem] before:top-5 before:w-px before:bg-border/70',
        className,
      )}
    >
      {children}
    </ol>
  )
}

export function TimelineNode({
  tone,
  label,
  children,
  className,
}: {
  tone: TimelineTone
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <li data-timeline-tone={tone} className={cn('relative pl-8', className)}>
      <span
        aria-label={label}
        className={cn(
          'absolute left-0 top-4 z-10 h-3.5 w-3.5 rounded-full border-2 border-background transition-[box-shadow,transform] duration-[var(--motion-expand)] motion-reduce:transition-none',
          tone === 'completed' && 'bg-[hsl(var(--training-complete))]',
          tone === 'active' &&
            'scale-110 bg-[hsl(var(--training-active))] shadow-[0_0_0_5px_hsl(var(--training-active)/0.14)]',
          tone === 'rest' && 'bg-muted-foreground',
          tone === 'upcoming' && 'bg-background ring-1 ring-inset ring-foreground/35',
          tone === 'missed' && 'bg-[hsl(var(--training-warning))]',
        )}
      />
      {children}
    </li>
  )
}
