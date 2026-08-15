'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import {
  ExerciseCatalogDialog,
  type ExerciseCatalogOption,
} from '@/components/plan/ExercisePicker'
import type { SessionExerciseDraft } from '@/store/sessionStore'

type SessionExercisePickerProps = {
  options: SessionExerciseDraft[]
  onSelect: (exercise: SessionExerciseDraft) => void
  placeholder?: string
  selectionMode?: 'single' | 'multiple'
}

export function SessionExercisePicker({
  options,
  onSelect,
  placeholder = 'Buscar ejercicio',
  selectionMode = 'single',
}: SessionExercisePickerProps) {
  const [open, setOpen] = useState(false)
  const catalogOptions = useMemo<ExerciseCatalogOption[]>(() => options.map(option => ({
    id: option.exerciseId,
    name: option.name,
    muscleGroups: option.muscleGroups,
    equipment: [],
    imageUrl: option.imageUrl,
  })), [options])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border/60 bg-background/80 px-3 text-left text-sm text-muted-foreground outline-none transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
        <span>{placeholder}</span>
      </button>

      <ExerciseCatalogDialog
        open={open}
        onOpenChange={setOpen}
        options={catalogOptions}
        selectionMode={selectionMode}
        title={selectionMode === 'multiple' ? 'Agregar ejercicios' : 'Seleccionar ejercicio'}
        confirmVerb={selectionMode === 'multiple' ? 'Agregar' : 'Seleccionar'}
        onConfirm={ids => {
          ids.forEach(id => {
            const selected = options.find(option => option.exerciseId === id)
            if (selected) onSelect(selected)
          })
        }}
      />
    </>
  )
}
