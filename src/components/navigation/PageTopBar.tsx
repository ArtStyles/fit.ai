import { FixedTopBar } from '@/components/navigation/FixedTopBar'
import { PendingLink } from '@/components/navigation/PendingLink'
import { PendingLinkIcon } from '@/components/navigation/PendingLinkIcon'

interface PageTopBarProps {
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  icon?: React.ReactNode
  right?: React.ReactNode
  accountSlot?: 'default' | 'hidden'
}

export function PageTopBar({
  title,
  subtitle,
  backHref,
  backLabel,
  icon,
  right,
  accountSlot = 'default',
}: PageTopBarProps) {
  return (
    <FixedTopBar
      accountSlot={accountSlot}
      contentClassName="justify-between"
      actions={right ? (
        <span data-page-topbar-actions className="contents">{right}</span>
      ) : undefined}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {backHref && backLabel ? (
          <PendingLink
            href={backHref}
            showSpinner={false}
            aria-label={backLabel}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          >
            <PendingLinkIcon name="arrow-left" className="h-5 w-5" />
          </PendingLink>
        ) : null}

        {icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
            {icon}
          </span>
        ) : null}

        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-bold leading-tight text-foreground">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
    </FixedTopBar>
  )
}
