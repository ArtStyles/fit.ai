'use client'

import { useMemo, useState } from 'react'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'

type ExercisePickerProps = {
  name: string
  label: string
  options: PlanExerciseOption[]
  placeholder?: string
  disabled?: boolean
}

function getOptionMeta(option: PlanExerciseOption): string {
  const groups = option.muscle_groups?.slice(0, 2).join(' · ')
  const equipment = option.equipment?.slice(0, 1).join(' · ')
  return [groups, equipment].filter(Boolean).join(' · ')
}

export function ExercisePicker({
  name,
  label,
  options,
  placeholder = 'Buscar ejercicio',
  disabled = false,
}: ExercisePickerProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<PlanExerciseOption | null>(null)

  const matches = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (normalized.length < 2) return options.slice(0, 6)

    return options
      .filter(option => {
        const haystack = [
          option.name,
          ...(option.muscle_groups ?? []),
          ...(option.equipment ?? []),
        ].join(' ').toLowerCase()

        return haystack.includes(normalized)
      })
      .slice(0, 6)
  }, [options, query])

  function selectOption(option: PlanExerciseOption) {
    setSelected(option)
    setQuery(option.name)
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected?.id ?? ''} />

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={event => {
            setQuery(event.target.value)
            setSelected(null)
          }}
          placeholder={placeholder}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      {selected ? (
        <div className="rounded-md border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-200">
          Seleccionado: {selected.name}
        </div>
      ) : (
        <div className="grid gap-1.5">
          {matches.map(option => {
            const meta = getOptionMeta(option)

            return (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                onClick={() => selectOption(option)}
                className="rounded-md border border-border/50 bg-muted/10 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="font-medium">{option.name}</span>
                {meta && (
                  <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                    {meta}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
