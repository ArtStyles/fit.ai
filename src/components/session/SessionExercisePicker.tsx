'use client'

import { useMemo, useState } from 'react'
import type { SessionExerciseDraft } from '@/store/sessionStore'

type SessionExercisePickerProps = {
  options: SessionExerciseDraft[]
  onSelect: (exercise: SessionExerciseDraft) => void
  placeholder?: string
}

function getMeta(option: SessionExerciseDraft): string {
  return option.muscleGroups.slice(0, 3).join(' · ')
}

export function SessionExercisePicker({
  options,
  onSelect,
  placeholder = 'Buscar ejercicio',
}: SessionExercisePickerProps) {
  const [query, setQuery] = useState('')

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (normalized.length < 2) return options.slice(0, 6)

    return options
      .filter(option => {
        const haystack = [
          option.name,
          ...option.muscleGroups,
        ].join(' ').toLowerCase()

        return haystack.includes(normalized)
      })
      .slice(0, 6)
  }, [options, query])

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-border/60 bg-background/80 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-indigo-500"
      />

      <div className="grid gap-1.5">
        {matches.map(option => {
          const meta = getMeta(option)

          return (
            <button
              key={option.exerciseId}
              type="button"
              onClick={() => {
                onSelect(option)
                setQuery('')
              }}
              className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/10"
            >
              <span className="font-semibold">{option.name}</span>
              {meta && (
                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                  {meta}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
