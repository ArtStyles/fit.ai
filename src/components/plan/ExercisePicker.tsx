'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'
import { Check, Search } from 'lucide-react'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

export type ExerciseCatalogOption = {
  id: string
  name: string
  muscleGroups: string[]
  equipment: string[]
  imageUrl: string | null
}

type ExerciseCatalogFilters = {
  query: string
  muscle: string
  equipment: string
}

function normalizeSearchValue(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
}

export function filterExerciseCatalog<T extends ExerciseCatalogOption>(
  options: T[],
  filters: ExerciseCatalogFilters,
): T[] {
  const query = normalizeSearchValue(filters.query)
  const muscle = normalizeSearchValue(filters.muscle)
  const equipment = normalizeSearchValue(filters.equipment)

  return options.filter(option => {
    const normalizedMuscles = option.muscleGroups.map(normalizeSearchValue)
    const normalizedEquipment = option.equipment.map(normalizeSearchValue)
    const haystack = normalizeSearchValue([
      option.name,
      ...option.muscleGroups,
      ...option.equipment,
    ].join(' '))

    return (!query || haystack.includes(query))
      && (!muscle || normalizedMuscles.includes(muscle))
      && (!equipment || normalizedEquipment.includes(equipment))
  })
}

export function collectExerciseFacets(options: ExerciseCatalogOption[]) {
  return {
    muscles: Array.from(new Set(options.flatMap(option => option.muscleGroups))).sort((a, b) => a.localeCompare(b, 'es')),
    equipment: Array.from(new Set(options.flatMap(option => option.equipment))).sort((a, b) => a.localeCompare(b, 'es')),
  }
}

export function toExerciseCatalogOptions(options: PlanExerciseOption[]): ExerciseCatalogOption[] {
  return options.map(option => ({
    id: option.id,
    name: option.name,
    muscleGroups: option.muscle_groups ?? [],
    equipment: option.equipment ?? [],
    imageUrl: option.image_url ?? null,
  }))
}

export function toggleExerciseSelection(
  current: string[],
  id: string,
  mode: 'single' | 'multiple',
  maximum = 12,
): string[] {
  if (mode === 'single') return [id]
  if (current.includes(id)) return current.filter(currentId => currentId !== id)
  if (current.length >= maximum) return current
  return [...current, id]
}

type ExerciseCatalogDialogViewProps = {
  options: ExerciseCatalogOption[]
  query: string
  muscle: string
  equipment: string
  selectedIds: string[]
  onQueryChange: (value: string) => void
  onMuscleChange: (value: string) => void
  onEquipmentChange: (value: string) => void
  onToggle: (id: string) => void
  onConfirm: () => void
  confirmVerb?: string
  selectionLimit?: number
}

export function ExerciseCatalogDialogView({
  options,
  query,
  muscle,
  equipment,
  selectedIds,
  onQueryChange,
  onMuscleChange,
  onEquipmentChange,
  onToggle,
  onConfirm,
  confirmVerb = 'Agregar',
  selectionLimit,
}: ExerciseCatalogDialogViewProps) {
  const facets = collectExerciseFacets(options)
  const matches = filterExerciseCatalog(options, { query, muscle, equipment })
  const selectionLabel = `${selectedIds.length} ${selectedIds.length === 1 ? 'ejercicio' : 'ejercicios'}`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-border/60 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar ejercicios"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Buscar ejercicio"
            autoFocus
            className="h-12 w-full rounded-xl border border-border/70 bg-muted/40 pl-10 pr-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="sr-only">Filtrar por equipo</span>
            <select
              value={equipment}
              onChange={event => onEquipmentChange(event.target.value)}
              className="h-11 w-full rounded-xl border border-border/70 bg-muted/40 px-3 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Todo el equipo</option>
              {facets.equipment.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar por músculo</span>
            <select
              value={muscle}
              onChange={event => onMuscleChange(event.target.value)}
              className="h-11 w-full rounded-xl border border-border/70 bg-muted/40 px-3 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Todos los músculos</option>
              {facets.muscles.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {matches.length > 0 ? (
          <ul className="divide-y divide-border/50">
            {matches.map(option => {
              const selected = selectedIds.includes(option.id)
              const limitReached = selectionLimit !== undefined && selectedIds.length >= selectionLimit
              const meta = [...option.muscleGroups.slice(0, 2), ...option.equipment.slice(0, 1)].join(' · ')
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={!selected && limitReached}
                    onClick={() => onToggle(option.id)}
                    className="flex min-h-[68px] w-full items-center gap-3 py-2 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ExerciseImage
                      src={option.imageUrl}
                      alt={option.name}
                      variant="thumb"
                      className="h-12 w-12 shrink-0 rounded-full"
                      frameClassName="rounded-full bg-white"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{option.name}</span>
                      {meta ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span> : null}
                    </span>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent'}`}>
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
            <p className="font-semibold text-foreground">No encontramos ejercicios</p>
            <p className="mt-1 text-sm text-muted-foreground">Prueba con otro nombre o limpia los filtros.</p>
          </div>
        )}
      </div>

      <div className="border-t border-border/60 bg-background/95 p-4 backdrop-blur">
        {selectionLimit !== undefined && selectedIds.length >= selectionLimit ? (
          <p role="status" className="mb-2 text-center text-xs text-muted-foreground">
            Máximo de {selectionLimit} ejercicios por vez.
          </p>
        ) : null}
        <button
          type="button"
          disabled={selectedIds.length === 0}
          onClick={onConfirm}
          className="min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-40"
        >
          {confirmVerb} {selectionLabel}
        </button>
      </div>
    </div>
  )
}

export function ExerciseCatalogDialog({
  open,
  onOpenChange,
  options,
  selectedIds = [],
  selectionMode = 'single',
  title = 'Agregar ejercicio',
  confirmVerb = 'Agregar',
  maxSelections = 12,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: ExerciseCatalogOption[]
  selectedIds?: string[]
  selectionMode?: 'single' | 'multiple'
  title?: string
  confirmVerb?: string
  maxSelections?: number
  onConfirm: (ids: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState('')
  const [equipment, setEquipment] = useState('')
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds)
  const selectedIdsKey = selectedIds.join(',')

  useEffect(() => {
    if (!open) return
    setQuery('')
    setMuscle('')
    setEquipment('')
    setDraftIds(selectedIdsKey ? selectedIdsKey.split(',') : [])
  }, [open, selectedIdsKey])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="h-[42rem] max-w-lg gap-0 border-border/70 bg-background p-0"
      >
        <div className="flex min-h-0 flex-col">
          <div className="border-b border-border/60 px-4 py-4 pr-16">
            <DialogTitle className="text-center text-base sm:text-left">{title}</DialogTitle>
          </div>
          <ExerciseCatalogDialogView
            options={options}
            query={query}
            muscle={muscle}
            equipment={equipment}
            selectedIds={draftIds}
            selectionLimit={selectionMode === 'multiple' ? maxSelections : undefined}
            onQueryChange={setQuery}
            onMuscleChange={setMuscle}
            onEquipmentChange={setEquipment}
            onToggle={id => {
              setDraftIds(current => toggleExerciseSelection(current, id, selectionMode, maxSelections))
            }}
            onConfirm={() => {
              onConfirm(draftIds)
              onOpenChange(false)
            }}
            confirmVerb={confirmVerb}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ExercisePickerProps = {
  name: string
  label: string
  options: PlanExerciseOption[]
  placeholder?: string
  disabled?: boolean
  multiple?: boolean
  onSelectionChange?: (selected: PlanExerciseOption[]) => void
}

export function ExercisePicker({
  name,
  label,
  options,
  placeholder = 'Buscar ejercicio',
  disabled = false,
  multiple = false,
  onSelectionChange,
}: ExercisePickerProps) {
  const [selected, setSelected] = useState<PlanExerciseOption[]>([])
  const [open, setOpen] = useState(false)
  const catalogOptions = useMemo<ExerciseCatalogOption[]>(() => toExerciseCatalogOptions(options), [options])

  return (
    <div className="space-y-2">
      {selected.length > 0
        ? selected.map(option => <input key={option.id} type="hidden" name={name} value={option.id} />)
        : <input type="hidden" name={name} value="" />}

      <div className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-input bg-background px-3 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={selected.length > 0 ? 'truncate font-medium' : 'truncate text-muted-foreground'}>
            {selected.length === 1
              ? selected[0].name
              : selected.length > 1
                ? `${selected.length} ejercicios seleccionados`
                : placeholder}
          </span>
        </button>
      </div>

      {selected.length > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          <Check className="h-4 w-4" aria-hidden="true" />
          <span className="truncate">
            {selected.length === 1 ? `Seleccionado: ${selected[0].name}` : `${selected.length} ejercicios listos para agregar`}
          </span>
        </div>
      ) : null}

      <ExerciseCatalogDialog
        open={open}
        onOpenChange={setOpen}
        options={catalogOptions}
        selectedIds={selected.map(option => option.id)}
        selectionMode={multiple ? 'multiple' : 'single'}
        title={multiple ? 'Agregar ejercicios' : 'Agregar ejercicio'}
        onConfirm={ids => {
          const nextSelected = ids.flatMap(id => {
            const option = options.find(candidate => candidate.id === id)
            return option ? [option] : []
          })
          setSelected(nextSelected)
          onSelectionChange?.(nextSelected)
        }}
      />
    </div>
  )
}
