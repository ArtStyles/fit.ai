'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity,
  CalendarDays,
  Check,
  Dumbbell,
  Gauge,
  SlidersHorizontal,
  Timer,
  Wrench,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/feedback/ToastProvider'
import { useI18n } from '@/components/i18n/I18nProvider'
import {
  applyPlanAdjustment,
  previewStructuredPlanAdjustment,
} from '@/app/actions/adjustPlan'
import {
  CARDIO_MODALITIES,
  type PlanAdjustmentOptions,
} from '@/lib/plans/adjustmentIntent'
import type { CardioModality, PlanAdjustmentIntent } from '@/lib/training-engine'
import {
  buildPlanAdjustmentIntent,
  buildPlanAdjustmentSummary,
  type PlanAdjustmentCategory,
  type PlanAdjustmentDraft,
} from './planAdjustmentForm'

interface Props {
  planId: string
  options: PlanAdjustmentOptions
}

const DAY_OPTIONS = [2, 3, 4, 5, 6] as const
const DURATION_OPTIONS = [30, 45, 60, 90] as const
const CARDIO_LABELS: Record<CardioModality, string> = {
  walking: 'Caminar',
  running: 'Correr',
  cycling: 'Bicicleta',
  elliptical: 'Elíptica',
  rowing: 'Remo',
  stairs: 'Escaleras',
  jump_rope: 'Cuerda',
}

const CATEGORIES = [
  { id: 'days', label: 'Días por semana', icon: CalendarDays },
  { id: 'duration', label: 'Duración de las sesiones', icon: Timer },
  { id: 'intensity', label: 'Intensidad', icon: Gauge },
  { id: 'equipment', label: 'Equipamiento no disponible', icon: Wrench },
  { id: 'cardio', label: 'Cardio preferido', icon: Activity },
  { id: 'exercise', label: 'Sustituir ejercicio', icon: Dumbbell },
] as const satisfies ReadonlyArray<{
  id: PlanAdjustmentCategory
  label: string
  icon: typeof CalendarDays
}>

export function PlanAdjustButton({ planId, options }: Props) {
  const router = useRouter()
  const { showToast } = useToast()
  const { language, t } = useI18n()
  const [open, setOpen] = useState(false)
  const defaultDays = Math.min(6, Math.max(2, Math.round(options.currentDaysPerWeek)))
  const [draft, setDraft] = useState<PlanAdjustmentDraft>({
    category: 'days',
    daysPerWeek: defaultDays,
  })
  const [previewIntent, setPreviewIntent] = useState<PlanAdjustmentIntent | null>(null)
  const [changesSummary, setChangesSummary] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const intent = buildPlanAdjustmentIntent(draft)
  const showingPreview = previewIntent !== null

  function clearPreview() {
    setPreviewIntent(null)
    setChangesSummary([])
    setError(null)
  }

  function resetDialog() {
    setDraft({ category: 'days', daysPerWeek: defaultDays })
    clearPreview()
  }

  function chooseCategory(category: PlanAdjustmentCategory) {
    clearPreview()
    if (category === 'days') {
      setDraft({ category: 'days', daysPerWeek: defaultDays })
    } else if (category === 'duration') {
      const currentDuration = options.currentSessionDurationMinutes
      setDraft({
        category,
        minutes: DURATION_OPTIONS.includes(currentDuration as 30 | 45 | 60 | 90)
          ? currentDuration as 30 | 45 | 60 | 90
          : 60,
      })
    } else if (category === 'intensity') {
      setDraft({ category, direction: 'easier' })
    } else if (category === 'equipment') {
      setDraft({ category, equipment: [] })
    } else if (category === 'cardio') {
      setDraft({
        category,
        cardioPreferences: options.cardioPreferences.length > 0
          ? options.cardioPreferences
          : ['walking'],
      })
    } else {
      setDraft({
        category,
        exerciseId: options.exercises[0]?.id ?? '',
      })
    }
  }

  async function handlePreview() {
    if (!intent || loading) return
    setLoading(true)
    setError(null)

    const result = await previewStructuredPlanAdjustment(planId, intent)
    setLoading(false)

    if (!result.success || !result.intent || !result.preview) {
      setError(t(result.error ?? 'No se pudo validar la vista previa del ajuste.'))
      return
    }
    setPreviewIntent(result.intent)
    setChangesSummary(buildPlanAdjustmentSummary(result.preview, language))
  }

  async function handleApply() {
    if (applying || !previewIntent) return
    setApplying(true)
    setError(null)

    const result = await applyPlanAdjustment(planId, previewIntent)
    setApplying(false)

    if (!result.success) {
      setError(t(result.error ?? 'No se pudo aplicar el ajuste.'))
      return
    }

    showToast({
      title: t('Plan semanal ajustado'),
      description: t('El motor recalculó y validó toda la semana.'),
      variant: 'success',
    })
    setOpen(false)
    window.dispatchEvent(new Event('fitai:navigation-start'))
    router.replace('/plan')
    router.refresh()
  }

  function toggleEquipment(equipment: string) {
    if (draft.category !== 'equipment') return
    const selected = draft.equipment.includes(equipment)
      ? draft.equipment.filter(item => item !== equipment)
      : [...draft.equipment, equipment]
    setDraft({ category: 'equipment', equipment: selected })
    clearPreview()
  }

  function toggleCardio(modality: CardioModality) {
    if (draft.category !== 'cardio') return
    const selected = draft.cardioPreferences.includes(modality)
      ? draft.cardioPreferences.filter(item => item !== modality)
      : [...draft.cardioPreferences, modality]
    setDraft({ category: 'cardio', cardioPreferences: selected })
    clearPreview()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetDialog()
          setOpen(true)
        }}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/5 px-4 text-sm font-semibold text-violet-200 transition-colors hover:bg-violet-500/10"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        {t('Ajustar plan')}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mx-4 max-h-[88vh] max-w-lg gap-0 overflow-y-auto rounded-2xl border-border/60 bg-popover p-0">
          <DialogHeader className="border-b border-border/40 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-sm text-white">
              <SlidersHorizontal className="h-4 w-4 text-violet-400" aria-hidden="true" />
              {t('Ajustar el plan activo')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-5 p-5">
            {!showingPreview ? (
              <>
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('Elige qué quieres cambiar')}
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.map(category => {
                      const Icon = category.icon
                      const selected = draft.category === category.id
                      const disabled =
                        (category.id === 'equipment' && options.availableEquipment.length === 0)
                        || (category.id === 'exercise' && options.exercises.length === 0)
                      return (
                        <button
                          key={category.id}
                          type="button"
                          aria-pressed={selected}
                          disabled={disabled}
                          onClick={() => chooseCategory(category.id)}
                          className={`flex min-h-16 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors ${
                            selected
                              ? 'border-violet-500/60 bg-violet-500/15 text-violet-100'
                              : 'border-border/50 bg-white/5 text-gray-300 hover:border-violet-500/30'
                          } disabled:cursor-not-allowed disabled:opacity-35`}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {t(category.label)}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <div className="rounded-xl border border-border/50 bg-white/[0.03] p-4">
                  {draft.category === 'days' ? (
                    <fieldset>
                      <legend className="mb-3 text-sm font-semibold text-white">
                        {t('Días por semana')}
                      </legend>
                      <div className="grid grid-cols-5 gap-2">
                        {DAY_OPTIONS.map(days => (
                          <button
                            key={days}
                            type="button"
                            aria-pressed={draft.daysPerWeek === days}
                            onClick={() => {
                              setDraft({ category: 'days', daysPerWeek: days })
                              clearPreview()
                            }}
                            className={`h-10 rounded-lg border text-sm font-semibold ${
                              draft.daysPerWeek === days
                                ? 'border-violet-400 bg-violet-500 text-white'
                                : 'border-border/60 text-gray-300 hover:border-violet-500/40'
                            }`}
                          >
                            {days}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {draft.category === 'duration' ? (
                    <fieldset>
                      <legend className="mb-3 text-sm font-semibold text-white">
                        {t('Duración de las sesiones')}
                      </legend>
                      <div className="grid grid-cols-4 gap-2">
                        {DURATION_OPTIONS.map(minutes => (
                          <button
                            key={minutes}
                            type="button"
                            aria-pressed={draft.minutes === minutes}
                            onClick={() => {
                              setDraft({ category: 'duration', minutes })
                              clearPreview()
                            }}
                            className={`h-10 rounded-lg border text-xs font-semibold ${
                              draft.minutes === minutes
                                ? 'border-violet-400 bg-violet-500 text-white'
                                : 'border-border/60 text-gray-300 hover:border-violet-500/40'
                            }`}
                          >
                            {minutes} min
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {draft.category === 'intensity' ? (
                    <fieldset>
                      <legend className="mb-3 text-sm font-semibold text-white">
                        {t('Intensidad')}
                      </legend>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          ['easier', 'Más suave'],
                          ['harder', 'Más intensa'],
                        ] as const).map(([direction, label]) => (
                          <button
                            key={direction}
                            type="button"
                            aria-pressed={draft.direction === direction}
                            onClick={() => {
                              setDraft({ category: 'intensity', direction })
                              clearPreview()
                            }}
                            className={`h-11 rounded-lg border text-sm font-semibold ${
                              draft.direction === direction
                                ? 'border-violet-400 bg-violet-500 text-white'
                                : 'border-border/60 text-gray-300 hover:border-violet-500/40'
                            }`}
                          >
                            {t(label)}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  {draft.category === 'equipment' ? (
                    <fieldset>
                      <legend className="mb-1 text-sm font-semibold text-white">
                        {t('Equipamiento no disponible')}
                      </legend>
                      <p className="mb-3 text-xs text-muted-foreground">
                        {t('Selecciona al menos un equipo')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {options.availableEquipment.map(equipment => {
                          const selected = draft.equipment.includes(equipment)
                          return (
                            <button
                              key={equipment}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleEquipment(equipment)}
                              className={`rounded-full border px-3 py-2 text-xs ${
                                selected
                                  ? 'border-violet-400 bg-violet-500 text-white'
                                  : 'border-border/60 text-gray-300 hover:border-violet-500/40'
                              }`}
                            >
                              {equipment}
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>
                  ) : null}

                  {draft.category === 'cardio' ? (
                    <fieldset>
                      <legend className="mb-1 text-sm font-semibold text-white">
                        {t('Cardio preferido')}
                      </legend>
                      <p className="mb-3 text-xs text-muted-foreground">
                        {t('Selecciona al menos una modalidad')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {CARDIO_MODALITIES.map(modality => {
                          const selected = draft.cardioPreferences.includes(modality)
                          return (
                            <button
                              key={modality}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleCardio(modality)}
                              className={`rounded-full border px-3 py-2 text-xs ${
                                selected
                                  ? 'border-violet-400 bg-violet-500 text-white'
                                  : 'border-border/60 text-gray-300 hover:border-violet-500/40'
                              }`}
                            >
                              {t(CARDIO_LABELS[modality])}
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>
                  ) : null}

                  {draft.category === 'exercise' ? (
                    <label className="flex flex-col gap-2 text-sm font-semibold text-white">
                      {t('Ejercicio que quieres sustituir')}
                      <select
                        value={draft.exerciseId}
                        onChange={event => {
                          setDraft({ category: 'exercise', exerciseId: event.target.value })
                          clearPreview()
                        }}
                        className="h-11 rounded-lg border border-border/60 bg-background px-3 text-sm font-normal text-foreground focus:border-violet-500 focus:outline-none"
                      >
                        {options.exercises.map(exercise => (
                          <option key={exercise.id} value={exercise.id}>
                            {exercise.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('El motor recalculará y validará el plan completo antes de aplicar el cambio.')}
                </p>
                {error ? <p role="alert" className="text-xs text-red-400">{error}</p> : null}
                <button
                  type="button"
                  onClick={() => { void handlePreview() }}
                  disabled={!intent || loading}
                  className="h-11 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {loading ? t('Recalculando vista previa…') : t('Vista previa del ajuste')}
                </button>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
                    {t('Vista previa del ajuste')}
                  </p>
                  <ul className="space-y-1.5">
                    {changesSummary.map(line => (
                      <li key={line} className="flex items-start gap-2 text-sm text-gray-300">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
                  {t('Al aplicar, se reemplazará el plan activo completo por una versión recalculada.')}
                </p>
                {error ? <p role="alert" className="text-xs text-red-400">{error}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={clearPreview}
                    className="flex-1 rounded-lg border border-border/50 py-2.5 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {t('Editar ajuste')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleApply() }}
                    disabled={applying}
                    className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {applying ? t('Aplicando…') : t('Aplicar ajuste')}
                  </button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
