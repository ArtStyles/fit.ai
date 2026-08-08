'use client'

import { setWorkspace } from '@/app/actions/workspace'
import type { Workspace } from '@/lib/coaching/workspace'
import { cn } from '@/lib/utils'

type WorkspaceSwitcherProps = {
  workspace: Workspace
  variant: 'desktop' | 'mobile'
}

export function WorkspaceSwitcher({ workspace, variant }: WorkspaceSwitcherProps) {
  if (variant === 'mobile') {
    const destination = workspace === 'coach' ? 'personal' : 'coach'
    const destinationLabel = destination === 'coach' ? 'Entrenador' : 'Personal'

    return (
      <form action={setWorkspace} className="flex shrink-0">
        <button
          type="submit"
          name="workspace"
          value={destination}
          className="min-h-11 rounded-xl px-3 text-xs font-semibold text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Cambiar al espacio ${destinationLabel}`}
        >
          {destinationLabel}
        </button>
      </form>
    )
  }

  return (
    <section className="border-t border-border/60 p-4" aria-label="Selector de espacio">
      <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Espacio</p>
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1">
        {(['personal', 'coach'] as const).map(option => {
          const selected = workspace === option
          const label = option === 'personal' ? 'Personal' : 'Entrenador'

          return (
            <form key={option} action={setWorkspace}>
              <button
                type="submit"
                name="workspace"
                value={option}
                aria-pressed={selected}
                className={cn(
                  'min-h-10 w-full rounded-lg px-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                  selected ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            </form>
          )
        })}
      </div>
    </section>
  )
}
