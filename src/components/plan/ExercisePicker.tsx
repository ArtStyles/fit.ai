'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PlanExerciseOption } from '@/components/plan/WorkoutExerciseList'
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Search } from 'lucide-react'
import { ExerciseImage } from '@/components/exercises/ExerciseImage'
import { PersonalExerciseForm } from '@/components/exercises/PersonalExerciseForm'
import { supportsPersonalExercises } from '@/lib/exercises/personal-platform'
import { useOptionalI18n } from '@/components/i18n/I18nProvider'
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
  exerciseType?: string
  personal?: boolean
}

async function requestExerciseCatalogPage(request: {
  page?: number
  query?: string
  muscle?: string
  equipment?: string
  includePersonal?: boolean
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
    ...(option.exercise_type ? { exerciseType: option.exercise_type } : {}),
    ...(option.personal === undefined ? {} : { personal: option.personal }),
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
  language?: 'es' | 'en'
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
  confirming?: boolean
  confirmationError?: string | null
  confirmationDetails?: ReactNode
  invalidIds?: string[]
  onCreatePersonal?: () => void
}

export function ExerciseCatalogDialogView({
  language = 'es',
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
  confirmVerb,
  selectionLimit,
  paginated = false,
  page = 1,
  totalPages = 1,
  loading = false,
  error = null,
  onPageChange,
  confirming = false,
  confirmationError = null,
  confirmationDetails,
  invalidIds = [],
  onCreatePersonal,
}: ExerciseCatalogDialogViewProps) {
  const copy = (es: string, en: string) => language === 'es' ? es : en
  const localFacets = collectExerciseFacets(options)
  const facets = providedFacets ?? {
    muscles: localFacets.muscles.map(value => ({ value, label: value })),
    equipment: localFacets.equipment.map(value => ({ value, label: value })),
  }
  const matches = paginated ? options : filterExerciseCatalog(options, { query, muscle, equipment })
  const selectionLabel = `${selectedIds.length} ${selectedIds.length === 1 ? copy('ejercicio', 'exercise') : copy('ejercicios', 'exercises')}`

  return (
    <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden">
      <div className="min-w-0 max-w-full space-y-3 overflow-hidden border-b border-border/60 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            aria-label={copy('Buscar ejercicios', 'Search exercises')}
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            disabled={confirming}
            placeholder={copy('Buscar ejercicio', 'Search exercise')}
            autoFocus
            className="h-12 w-full rounded-xl border border-border/70 bg-muted/40 pl-10 pr-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <fieldset disabled={confirming} className={`m-0 min-w-0 border-0 p-0 ${confirming ? 'opacity-60' : ''}`} aria-disabled={confirming || undefined}>
            <CompactCategorySelect
              ariaLabel={copy('Filtrar por equipo', 'Filter by equipment')}
              value={equipment}
              onValueChange={onEquipmentChange}
              options={facets.equipment}
              allLabel={copy('Todo el equipo', 'All equipment')}
              className="bg-muted/40 font-medium"
            />
          </fieldset>
          <fieldset disabled={confirming} className={`m-0 min-w-0 border-0 p-0 ${confirming ? 'opacity-60' : ''}`} aria-disabled={confirming || undefined}>
            <CompactCategorySelect
              ariaLabel={copy('Filtrar por músculo', 'Filter by muscle')}
              value={muscle}
              onValueChange={onMuscleChange}
              options={facets.muscles}
              allLabel={copy('Todos los músculos', 'All muscles')}
              className="bg-muted/40 font-medium"
            />
          </fieldset>
        </div>
        {onCreatePersonal ? <button type="button" onClick={onCreatePersonal} disabled={confirming || (selectionLimit !== undefined && selectedIds.length >= selectionLimit)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"><Plus className="h-4 w-4" aria-hidden="true" />{copy('Crear ejercicio', 'Create exercise')}</button> : null}
      </div>

      <div
        key={paginated ? `${page}:${query}:${muscle}:${equipment}` : 'local-catalog'}
        aria-busy={loading || undefined}
        className="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto px-4 py-2"
      >
        {loading && matches.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            <span className="sr-only">{copy('Cargando ejercicios', 'Loading exercises')}</span>
          </div>
        ) : error ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center" role="alert">
            <p className="font-semibold text-foreground">{copy('No pudimos cargar los ejercicios', 'Could not load exercises')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        ) : matches.length > 0 ? (
          <ul className="min-w-0 max-w-full divide-y divide-border/50 overflow-hidden">
            {matches.map(option => {
              const selected = selectedIds.includes(option.id)
              const invalid = invalidIds.includes(option.id)
              const limitReached = selectionLimit !== undefined && selectedIds.length >= selectionLimit
              const meta = [...option.muscleGroups.slice(0, 2), ...option.equipment.slice(0, 1)].join(' · ')
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-invalid={invalid || undefined}
                    disabled={confirming || loading || (!selected && (limitReached || invalid))}
                    onClick={() => onToggle(option.id)}
                    className="flex min-h-[68px] w-full min-w-0 max-w-full items-center gap-3 overflow-hidden py-2 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:bg-muted/20"
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
                      {meta ? <span className="mt-0.5 block truncate text-xs text-foreground/70">{meta}</span> : null}
                      {option.personal ? <span className="mt-1 inline-flex rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{copy('Solo tú', 'Only you')}</span> : null}
                      {invalid ? <span className="mt-0.5 block truncate text-xs font-semibold text-destructive">{copy(`ID ${option.id} ya no disponible`, `ID ${option.id} is no longer available`)}</span> : null}
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
            <p className="font-semibold text-foreground">{copy('No encontramos ejercicios', 'No exercises found')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{copy('Prueba con otro nombre o limpia los filtros.', 'Try another name or clear the filters.')}</p>
          </div>
        )}
      </div>

      {paginated && totalPages > 1 ? (
        <div className="flex min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden border-t border-border/60 px-4 py-2">
          <button
            type="button"
            onClick={() => onPageChange?.(page - 1)}
            disabled={confirming || page <= 1 || loading}
            className="inline-flex min-h-11 min-w-0 shrink items-center gap-1 rounded-xl border border-border px-2 text-xs font-semibold text-foreground disabled:opacity-40 sm:px-3"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {copy('Anterior', 'Previous')}
          </button>
          <p className="shrink-0 text-xs font-medium text-muted-foreground" aria-live="polite">
            {copy(`Página ${page} de ${totalPages}`, `Page ${page} of ${totalPages}`)}
          </p>
          <button
            type="button"
            onClick={() => onPageChange?.(page + 1)}
            disabled={confirming || page >= totalPages || loading}
            className="inline-flex min-h-11 min-w-0 shrink items-center gap-1 rounded-xl border border-border px-2 text-xs font-semibold text-foreground disabled:opacity-40 sm:px-3"
          >
            {copy('Siguiente', 'Next')}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="border-t border-border/60 bg-background/95 p-4 backdrop-blur">
        {selectionLimit !== undefined && selectedIds.length >= selectionLimit ? (
          <p role="status" className="mb-2 text-center text-xs text-muted-foreground">
            {copy(`Máximo de ${selectionLimit} ejercicios por vez.`, `Up to ${selectionLimit} exercises at a time.`)}
          </p>
        ) : null}
        {confirmationDetails ? <div className="mb-2 text-sm text-muted-foreground">{confirmationDetails}</div> : null}
        {confirmationError ? <p role="alert" className="mb-2 text-sm text-destructive">{confirmationError}</p> : null}
        <button
          type="button"
          disabled={confirming || selectedIds.length === 0}
          aria-disabled={confirming || undefined}
          onClick={onConfirm}
          className="min-h-12 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-40"
        >
          {confirming ? copy('Agregando…', 'Adding…') : `${confirmVerb ?? copy('Agregar', 'Add')} ${selectionLabel}`}
        </button>
      </div>
    </div>
  )
}

export function ExerciseCatalogDialog({
  language: providedLanguage,
  allowPersonalExercises = false,
  open,
  onOpenChange,
  options,
  selectedIds = [],
  selectionMode = 'single',
  title,
  confirmVerb,
  maxSelections = 12,
  paginated = false,
  confirmationError,
  confirmationDetails,
  invalidIds = [],
  onConfirm,
  onCloseAutoFocus,
  onPersonalExerciseCreated,
}: {
  language?: 'es' | 'en'
  allowPersonalExercises?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  options: ExerciseCatalogOption[]
  selectedIds?: string[]
  selectionMode?: 'single' | 'multiple'
  title?: string
  confirmVerb?: string
  maxSelections?: number
  paginated?: boolean
  confirmationError?: string | null
  confirmationDetails?: ReactNode
  invalidIds?: string[]
  onConfirm: (ids: string[], selectedOptions?: ExerciseCatalogOption[]) => boolean | void | Promise<boolean | void>
  onCloseAutoFocus?: (event: Event) => void
  onPersonalExerciseCreated?: (exercise: ExerciseCatalogOption) => void
}) {
  const i18n = useOptionalI18n()
  const language = providedLanguage ?? i18n?.language ?? 'es'
  const copy = (es: string, en: string) => language === 'es' ? es : en
  const personalEnabled = allowPersonalExercises && supportsPersonalExercises
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
  const [confirming, setConfirming] = useState(false)
  const [internalConfirmationError, setInternalConfirmationError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [createdOptions, setCreatedOptions] = useState<ExerciseCatalogOption[]>([])
  const opened = useRef(false)
  const lifecycle = useRef(0)
  const confirmationPending = useRef(false)
  const selectedIdsKey = selectedIds.join(',')

  useEffect(() => {
    if (!open) { opened.current = false; lifecycle.current++; return }
    if (opened.current) {
      setKnownOptions(current => {
        const next = new Map(current)
        for (const option of options) next.set(option.id, option)
        return next
      })
      return
    }
    opened.current = true
    setQuery('')
    setMuscle('')
    setEquipment('')
    setPage(1)
    setPageOptions(options.slice(0, 24))
    setKnownOptions(new Map(options.map(option => [option.id, option])))
    setDraftIds(selectedIdsKey ? selectedIdsKey.split(',') : [])
    setCreatedOptions([])
    setCreating(false)
    setCreatingBusy(false)
    setInternalConfirmationError(null)
    setConfirming(false)
    confirmationPending.current = false
  }, [open, options, selectedIdsKey])

  useEffect(() => () => { lifecycle.current++ }, [])

  useEffect(() => {
    if (!open || !paginated || creating) return
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void requestExerciseCatalogPage({ page, query, muscle, equipment, ...(personalEnabled ? { includePersonal: true } : {}) })
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
          setError(cause instanceof Error ? cause.message : language === 'es' ? 'Inténtalo otra vez.' : 'Try again.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, query ? 250 : 0)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [equipment, muscle, open, page, paginated, query, creating, personalEnabled, language])

  const visibleOptions = Array.from(new Map([
    ...filterExerciseCatalog(createdOptions, { query, muscle, equipment }),
    ...(paginated ? pageOptions : options),
  ].map(option => [option.id, option])).values())

  async function confirmSelection() {
    if (confirmationPending.current || draftIds.length === 0) return
    confirmationPending.current = true
    const version = lifecycle.current
    setConfirming(true)
    setInternalConfirmationError(null)
    try {
      const selectedOptions = draftIds.flatMap(id => {
        const option = knownOptions.get(id)
        return option ? [option] : []
      })
      const result = await onConfirm(draftIds, selectedOptions)
      if (version === lifecycle.current && result !== false) onOpenChange(false)
    } catch (cause) {
      if (version === lifecycle.current) setInternalConfirmationError(cause instanceof Error ? cause.message : copy('No se pudo completar la selección.', 'Could not complete the selection.'))
    } finally {
      if (version === lifecycle.current) { setConfirming(false); confirmationPending.current = false }
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && (confirming || creatingBusy)) return
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        closeLabel={copy('Cerrar', 'Close')}
        onCloseAutoFocus={onCloseAutoFocus}
        className="h-[42rem] max-w-lg gap-0 border-border/70 bg-background p-0"
      >
        <div className="flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
          <div className="border-b border-border/60 px-4 py-4 pr-16">
            <DialogTitle className="text-center text-base sm:text-left">{creating ? copy('Crear ejercicio', 'Create exercise') : title ?? copy('Agregar ejercicio', 'Add exercise')}</DialogTitle>
          </div>
          {creating && personalEnabled ? <PersonalExerciseForm language={language} onBusyChange={setCreatingBusy} onCancel={() => { if (!creatingBusy) setCreating(false) }} onCreated={exercise => {
            onPersonalExerciseCreated?.(exercise)
            setCreatedOptions(current => [exercise, ...current.filter(option => option.id !== exercise.id)])
            setKnownOptions(current => new Map(current).set(exercise.id, exercise))
            setDraftIds(current => toggleExerciseSelection(current, exercise.id, selectionMode, maxSelections))
            setQuery(''); setMuscle(''); setEquipment(''); setPage(1)
            setCreating(false); setCreatingBusy(false); setInternalConfirmationError(null)
          }} /> : <ExerciseCatalogDialogView
            language={language}
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
              setInternalConfirmationError(null)
              setDraftIds(current => toggleExerciseSelection(current, id, selectionMode, maxSelections))
            }}
            onConfirm={confirmSelection}
            confirmVerb={confirmVerb}
            paginated={paginated}
            page={page}
            totalPages={totalPages}
            loading={loading}
            error={error}
            onPageChange={setPage}
            confirming={confirming}
            confirmationError={confirmationError ?? internalConfirmationError}
            confirmationDetails={confirmationDetails}
            invalidIds={invalidIds}
            onCreatePersonal={personalEnabled ? () => { setCreating(true); setError(null) } : undefined}
          />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ExercisePickerProps = {
  language?: 'es' | 'en'
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
  language: providedLanguage,
  name,
  label,
  options,
  placeholder,
  disabled = false,
  multiple = false,
  paginated = false,
  onSelectionChange,
}: ExercisePickerProps) {
  const i18n = useOptionalI18n()
  const language = providedLanguage ?? i18n?.language ?? 'es'
  const copy = (es: string, en: string) => language === 'es' ? es : en
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
                ? copy(`${selected.length} ejercicios seleccionados`, `${selected.length} exercises selected`)
                : placeholder ?? copy('Buscar ejercicio', 'Search exercise')}
          </span>
        </button>
      </div>

      {selected.length > 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          <Check className="h-4 w-4" aria-hidden="true" />
          <span className="truncate">
            {selected.length === 1 ? copy(`Seleccionado: ${selected[0].name}`, `Selected: ${selected[0].name}`) : copy(`${selected.length} ejercicios listos para agregar`, `${selected.length} exercises ready to add`)}
          </span>
        </div>
      ) : null}

      <ExerciseCatalogDialog
        open={open}
        onOpenChange={setOpen}
        options={catalogOptions}
        selectedIds={selected.map(option => option.id)}
        language={language}
        selectionMode={multiple ? 'multiple' : 'single'}
        title={multiple ? copy('Agregar ejercicios', 'Add exercises') : copy('Agregar ejercicio', 'Add exercise')}
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
              exercise_type: remote.exerciseType ?? null,
              is_compound: null,
              ...(remote.personal === undefined ? {} : { personal: remote.personal }),
            }] : []
          })
          setSelected(nextSelected)
          onSelectionChange?.(nextSelected)
        }}
      />
    </div>
  )
}
