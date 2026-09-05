'use client'

import { setWorkspace } from '@/app/actions/workspace'
import type { Workspace } from '@/lib/coaching/workspace'
import { cn } from '@/lib/utils'
import { ArrowLeftRight } from 'lucide-react'

type WorkspaceSwitcherProps = {
  workspace: Workspace
  variant: 'desktop' | 'mobile'
}

export function WorkspaceSwitcher({ workspace, variant }: WorkspaceSwitcherProps) {
  if (variant === 'mobile') {
    const destination = workspace === 'coach' ? 'personal' : 'coach'
    const destinationLabel = destination === 'coach' ? 'Entrenador' : 'Personal'

    return (
      <form action={setWorkspace} className="flex w-11 shrink-0 min-[380px]:w-auto">
        <button
          type="submit"
          name="workspace"
          value={destination}
          className="flex h-11 w-11 items-center justify-center rounded-xl p-0 text-xs font-semibold text-primary outline-none transition-colors hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring min-[380px]:w-auto min-[380px]:px-3"
          aria-label={`Cambiar al espacio ${destinationLabel}`}
        >
          <ArrowLeftRight data-bottom-nav-icon aria-hidden="true" className="h-5 w-5 min-[380px]:hidden" />
          <span className="hidden min-[380px]:inline">{destinationLabel}</span>
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
                  'min-h-11 w-full rounded-lg px-2 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
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
