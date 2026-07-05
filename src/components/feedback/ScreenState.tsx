import type { ReactNode } from 'react'

export type ScreenStateKind = 'loading' | 'empty' | 'error' | 'success' | 'blocked' | 'offline'

export function ScreenState({ kind, title, description, action }: {
  kind: ScreenStateKind
  title: string
  description: string
  action?: ReactNode
}) {
  const urgent = kind === 'error' || kind === 'blocked'
  return (
    <section role={urgent ? 'alert' : 'status'} aria-live={urgent ? 'assertive' : 'polite'} className="rounded-card border bg-surface-1 p-6 text-center">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  )
}
