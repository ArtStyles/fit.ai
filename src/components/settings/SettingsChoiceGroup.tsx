'use client'

import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

export type SettingsChoice<T extends string | number> = {
  value: T
  label: string
  description?: string
  icon?: ComponentType<{ className?: string }>
}

export function SettingsChoiceGroup<T extends string | number>({
  label,
  options,
  selected,
  multiple,
  onToggle,
  error,
}: {
  label: string
  options: readonly SettingsChoice<T>[]
  selected: readonly T[]
  multiple: boolean
  onToggle: (value: T) => void
  error?: string
}) {
  return (
    <fieldset aria-invalid={Boolean(error)}>
      <legend className="mb-3 text-sm font-semibold text-foreground">{label}</legend>
      <div data-selection-mode={multiple ? 'multiple' : 'single'} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map(option => {
          const active = selected.includes(option.value)
          const Icon = option.icon

          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(option.value)}
              className={cn(
                'min-h-11 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                active ? 'border-violet-500 bg-violet-500/15 text-violet-100' : 'border-border/60 bg-background text-foreground',
              )}
            >
              {Icon ? <Icon className="mx-auto mb-1 h-4 w-4" aria-hidden="true" /> : null}
              {option.label}
              {option.description ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{option.description}</span> : null}
            </button>
          )
        })}
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-red-300">{error}</p> : null}
    </fieldset>
  )
}
