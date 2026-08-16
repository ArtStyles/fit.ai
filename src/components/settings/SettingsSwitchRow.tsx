import type { ReactNode } from 'react'

export function SettingsSwitchRow({
  title,
  description,
  icon,
  status,
  control,
}: {
  title: string
  description?: string
  icon?: ReactNode
  status?: ReactNode
  control: ReactNode
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4 rounded-2xl border border-border/60 bg-muted/10 p-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <span className="shrink-0 text-muted-foreground" aria-hidden="true">{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
          {status ? <div className="mt-2">{status}</div> : null}
        </div>
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}
