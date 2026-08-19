import type React from 'react'
import { PendingLink } from '@/components/navigation/PendingLink'

type AdminPageHeaderProps = {
  eyebrow?: string
  title: string
  description?: string
  backHref?: string
  backLabel?: string
  actions?: React.ReactNode
}

export function AdminPageHeader({ eyebrow = 'Operaciones', title, description, backHref, backLabel, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {backHref && backLabel ? <PendingLink href={backHref}>{backLabel}</PendingLink> : null}
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-violet-300">{eyebrow}</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-foreground">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  )
}
