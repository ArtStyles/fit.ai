'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'
import { Check, ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  CompactCategorySelect,
  type CompactCategoryOption,
} from '@/components/ui/compact-category-select'

export type ExerciseCatalogOption = {
  id: string
  name: string
  muscleGroups: string[]
  equipment: string[]
  imageUrl: string | null
}

async function requestExerciseCatalogPage(request: {
  page?: number
  query?: string
  muscle?: string
  equipment?: string
}) {
  const { loadExerciseCatalogPage } = await import('@/app/actions/exerciseCatalog')
  return loadExerciseCatalogPage(request)
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

export function mergeExerciseCatalogOptions(
  options: PlanExerciseOption[],
  selected: PlanExerciseOption[],
): ExerciseCatalogOption[] {
  const combined = new Map<string, ExerciseCatalogOption>()
  for (const option of toExerciseCatalogOptions(options)) combined.set(option.id, option)
  for (const option of toExerciseCatalogOptions(selected)) combined.set(option.id, option)
  return Array.from(combined.values())
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
  facets?: {
    muscles: CompactCategoryOption[]
    equipment: CompactCategoryOption[]
  }
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
  paginated?: boolean
  page?: number
  totalPages?: number
  loading?: boolean
  error?: string | null
  onPageChange?: (page: number) => void
}

export function ExerciseCatalogDialogView({
  options,
  facets: providedFacets,
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
  paginated = false,
  page = 1,
  totalPages = 1,
  loading = false,
  error = null,
  onPageChange,
}: ExerciseCatalogDialogViewProps) {
  const localFacets = collectExerciseFacets(options)
  const facets = providedFacets ?? {
    muscles: localFacets.muscles.map(value => ({ value, label: value })),
    equipment: localFacets.equipment.map(value => ({ value, label: value })),
  }
  const matches = paginated ? options : filterExerciseCatalog(options, { query, muscle, equipment })
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

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <div className="min-w-0">
            <CompactCategorySelect
              ariaLabel="Filtrar por equipo"
              value={equipment}
              onValueChange={onEquipmentChange}
              options={facets.equipment}
              allLabel="Todo el equipo"
              className="bg-muted/40 font-medium"
            />
          </div>
          <div className="min-w-0">
            <CompactCategorySelect
              ariaLabel="Filtrar por músculo"
              value={muscle}
              onValueChange={onMuscleChange}
              options={facets.muscles}
              allLabel="Todos los músculos"
              className="bg-muted/40 font-medium"
            />
          </div>
        </div>
      </div>

      <div
        key={paginated ? `${page}:${query}:${muscle}:${equipment}` : 'local-catalog'}
        aria-busy={loading || undefined}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-2"
      >
        {loading && matches.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">Cargando ejercicios</span>
          </div>
        ) : error ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center" role="alert">
            <p className="font-semibold text-foreground">No pudimos cargar los ejercicios</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : matches.length > 0 ? (
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
                    disabled={loading || (!selected && limitReached)}
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

      {paginated && totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2">
          <button
            type="button"
            onClick={() => onPageChange?.(page - 1)}
            disabled={page <= 1 || loading}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border px-3 text-xs font-semibold text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Anterior
          </button>
          <p className="text-xs font-medium text-muted-foreground" aria-live="polite">
            Página {page} de {totalPages}
          </p>
          <button
            type="button"
            onClick={() => onPageChange?.(page + 1)}
            disabled={page >= totalPages || loading}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border px-3 text-xs font-semibold text-foreground disabled:opacity-40"
          >
            Siguiente
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

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
  paginated = false,
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
  paginated?: boolean
  onConfirm: (ids: string[], selectedOptions?: ExerciseCatalogOption[]) => void
}) {
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState('')
  const [equipment, setEquipment] = useState('')
  const [draftIds, setDraftIds] = useState<string[]>(selectedIds)
  const [page, setPage] = useState(1)
  const [pageOptions, setPageOptions] = useState<ExerciseCatalogOption[]>(options.slice(0, 24))
  const [totalPages, setTotalPages] = useState(1)
  const [facets, setFacets] = useState<{
    muscles: CompactCategoryOption[]
    equipment: CompactCategoryOption[]
  }>(() => {
    const initial = collectExerciseFacets(options)
    return {
      muscles: initial.muscles.map(value => ({ value, label: value })),
      equipment: initial.equipment.map(value => ({ value, label: value })),
    }
  })
  const [knownOptions, setKnownOptions] = useState<Map<string, ExerciseCatalogOption>>(
    () => new Map(options.map(option => [option.id, option])),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedIdsKey = selectedIds.join(',')

  useEffect(() => {
    if (!open) return
    setQuery('')
    setMuscle('')
    setEquipment('')
    setPage(1)
    setPageOptions(options.slice(0, 24))
    setKnownOptions(new Map(options.map(option => [option.id, option])))
    setDraftIds(selectedIdsKey ? selectedIdsKey.split(',') : [])
  }, [open, options, selectedIdsKey])

  useEffect(() => {
    if (!open || !paginated) return
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void requestExerciseCatalogPage({ page, query, muscle, equipment })
        .then(result => {
          if (!active) return
          setPageOptions(result.items)
          setTotalPages(result.totalPages)
          setFacets(result.facets)
          setKnownOptions(current => {
            const next = new Map(current)
            for (const option of result.items) next.set(option.id, option)
            return next
          })
        })
        .catch(cause => {
          if (!active) return
          setError(cause instanceof Error ? cause.message : 'Inténtalo otra vez.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, query ? 250 : 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [equipment, muscle, open, page, paginated, query])

  const visibleOptions = paginated ? pageOptions : options

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
            options={visibleOptions}
            facets={paginated ? facets : undefined}
            query={query}
            muscle={muscle}
            equipment={equipment}
            selectedIds={draftIds}
            selectionLimit={selectionMode === 'multiple' ? maxSelections : undefined}
            onQueryChange={value => { setQuery(value); setPage(1) }}
            onMuscleChange={value => { setMuscle(value); setPage(1) }}
            onEquipmentChange={value => { setEquipment(value); setPage(1) }}
            onToggle={id => {
              setDraftIds(current => toggleExerciseSelection(current, id, selectionMode, maxSelections))
            }}
            onConfirm={() => {
              onConfirm(draftIds, draftIds.flatMap(id => {
                const option = knownOptions.get(id)
                return option ? [option] : []
              }))
              onOpenChange(false)
            }}
            confirmVerb={confirmVerb}
            paginated={paginated}
            page={page}
            totalPages={totalPages}
            loading={loading}
            error={error}
            onPageChange={setPage}
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
  paginated?: boolean
  onSelectionChange?: (selected: PlanExerciseOption[]) => void
}

export function ExercisePicker({
  name,
  label,
  options,
  placeholder = 'Buscar ejercicio',
  disabled = false,
  multiple = false,
  paginated = false,
  onSelectionChange,
}: ExercisePickerProps) {
  const [selected, setSelected] = useState<PlanExerciseOption[]>([])
  const [open, setOpen] = useState(false)
  const catalogOptions = useMemo<ExerciseCatalogOption[]>(
    () => mergeExerciseCatalogOptions(options, selected),
    [options, selected],
  )

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
        paginated={paginated}
        onConfirm={(ids, remoteOptions = []) => {
          const nextSelected = ids.flatMap(id => {
            const option = options.find(candidate => candidate.id === id)
            if (option) return [option]
            const remote = remoteOptions.find(candidate => candidate.id === id)
            return remote ? [{
              id: remote.id,
              name: remote.name,
              image_url: remote.imageUrl,
              muscle_groups: remote.muscleGroups,
              equipment: remote.equipment,
              difficulty: null,
              exercise_type: null,
              is_compound: null,
            }] : []
          })
          setSelected(nextSelected)
          onSelectionChange?.(nextSelected)
        }}
      />
    </div>
  )
}
