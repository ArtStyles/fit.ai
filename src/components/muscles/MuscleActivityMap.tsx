'use client'

import { useId, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { buildMuscleActivity, buildMuscleBreakdown, type MuscleActivityInput, type MuscleDateRange, type MuscleGroupId } from '@/lib/muscles/activity'
import { MuscleActivityDetails } from './MuscleActivityDetails'
import geometry from '@/lib/muscles/geometry.json'

const REGION_GROUP: Record<string, MuscleGroupId> = {
  chest: 'chest', abs: 'core', obliques: 'core', serratus: 'core', biceps: 'biceps', triceps: 'triceps',
  deltoids: 'shoulders', quadriceps: 'quads', calves: 'calves', adductors: 'hips', hipFlexors: 'hips',
  trapezius: 'traps', upperBack: 'back', lowerBack: 'lower_back', neck: 'neck', tibialis: 'tibialis',
  forearm: 'forearms', gluteal: 'glutes', hamstring: 'hamstrings',
}
const DRAWN_GROUPS = new Set(Object.values(REGION_GROUP))
const FILL_LEVEL = [
  'fill-muted-foreground/35',
  'fill-violet-200 dark:fill-violet-600',
  'fill-violet-300 dark:fill-violet-500',
  'fill-violet-400 dark:fill-violet-400',
  'fill-violet-600 dark:fill-violet-200',
]

type Props = {
  rows: MuscleActivityInput[]
  mode: 'planned' | 'completed'
  language: 'es' | 'en'
  range?: MuscleDateRange
  comparison?: { range: MuscleDateRange; hasRecords: boolean }
}

export function MuscleActivityMap({ rows, mode, language, range, comparison }: Props) {
  const id = useId()
  const [selectedId, setSelectedId] = useState<MuscleGroupId | null>(null)
  const from = range?.from
  const to = range?.to
  const activity = useMemo(() => buildMuscleActivity(rows, from && to ? { from, to } : undefined), [rows, from, to])
  const withoutDrawing = activity.groups.filter(group => group.sets > 0 && !DRAWN_GROUPS.has(group.id))
  const selected = activity.groups.find(group => group.id === selectedId)
  const previousFrom = comparison?.range.from
  const previousTo = comparison?.range.to
  const breakdown = useMemo(() => selectedId && from && to && previousFrom && previousTo ? {
    current: buildMuscleBreakdown(rows, selectedId, { from, to }),
    previous: buildMuscleBreakdown(rows, selectedId, { from: previousFrom, to: previousTo }),
  } : null, [rows, selectedId, from, to, previousFrom, previousTo])
  const es = language === 'es'
  const seriesLabel = (count: number) => mode === 'planned'
    ? (es ? (count === 1 ? 'serie prescrita' : 'series prescritas') : (count === 1 ? 'planned set' : 'planned sets'))
    : (es ? (count === 1 ? 'serie completada' : 'series completadas') : (count === 1 ? 'completed set' : 'completed sets'))
  const label = (group: typeof activity.groups[number]) => es ? group.es : group.en
  const select = (groupId: MuscleGroupId) => setSelectedId(current => current === groupId ? null : groupId)

  return (
    <div data-muscle-map={mode} className="min-w-0">
      <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-border/50 bg-background/40 px-2 py-3 sm:gap-6 sm:px-5">
        {geometry.models.map(model => (
          <figure key={model.side} className="min-w-0">
            <svg
              viewBox={model.viewBox}
              role="img"
              aria-labelledby={`${id}-${model.side}`}
              className="mx-auto h-60 w-full max-w-44 sm:h-72"
            >
              <title id={`${id}-${model.side}`}>{model.side === 'front' ? (es ? 'Vista anterior' : 'Front view') : (es ? 'Vista posterior' : 'Back view')}</title>
              {model.parts.map(part => {
                const groupId = REGION_GROUP[part.slug]
                const group = activity.groups.find(item => item.id === groupId)
                const isSelected = selectedId !== null && selectedId === groupId
                return (
                  <g
                    key={part.slug}
                    data-muscle-region={part.slug}
                    data-muscle-group={groupId}
                    className={cn(group ? FILL_LEVEL[group.level] : 'fill-muted-foreground/10', group && 'cursor-pointer', isSelected && 'stroke-foreground')}
                    strokeWidth={isSelected ? 5 : 0}
                    opacity={selectedId && groupId && !isSelected ? 0.5 : 1}
                    onClick={group ? () => select(groupId) : undefined}
                    aria-hidden="true"
                  >
                    {part.paths.map((path, index) => <path key={index} d={path} />)}
                  </g>
                )
              })}
            </svg>
            <figcaption className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {model.side === 'front' ? (es ? 'Anterior' : 'Front') : (es ? 'Posterior' : 'Back')}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-muted-foreground" aria-label={es ? 'Escala relativa de series' : 'Relative set scale'}>
        <span>{es ? 'Sin series' : 'No sets'}</span>
        {FILL_LEVEL.map(fill => <svg key={fill} className="h-2.5 w-2.5" aria-hidden="true" viewBox="0 0 10 10"><rect width="10" height="10" rx="3" className={fill} /></svg>)}
        <span>{es ? 'Más series' : 'More sets'}</span>
      </div>

      <div className="mt-5 min-h-14 rounded-xl bg-muted/30 px-3 py-2" aria-live="polite" aria-atomic="true">
        {selected ? (
          <p className="text-sm leading-relaxed"><strong className="text-foreground">{label(selected)}</strong><span className="text-muted-foreground"> · {selected.sets} {seriesLabel(selected.sets)}</span></p>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {activity.totalSets === 0
              ? mode === 'completed'
                ? (es ? 'Aún no hay series completadas en este periodo.' : 'No completed sets in this period yet.')
                : (es ? 'Añade ejercicios a tu plan para ver su distribución.' : 'Add exercises to your plan to see their distribution.')
              : mode === 'completed'
                ? (es ? 'Toca un músculo para comparar sus series y ver qué ejercicios las aportaron.' : 'Tap a muscle to compare its sets and see which exercises contributed them.')
                : (es ? 'Selecciona un grupo para ver sus series.' : 'Select a muscle group to see its sets.')}
          </p>
        )}
      </div>

      {mode === 'completed' && selected && breakdown && range && comparison && (
        <MuscleActivityDetails key={selectedId} current={breakdown.current} previous={breakdown.previous} range={range} previousRange={comparison.range} hasPreviousRecords={comparison.hasRecords} muscleName={label(selected)} language={language} />
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label={es ? 'Grupos musculares' : 'Muscle groups'}>
        {activity.groups.map(group => (
          <button
            key={group.id}
            type="button"
            aria-pressed={selectedId === group.id}
            aria-label={`${label(group)}: ${group.sets} ${seriesLabel(group.sets)}`}
            onClick={() => select(group.id)}
            className={cn(
              'flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              selectedId === group.id ? 'border-violet-500 bg-violet-500/10 text-foreground' : 'border-border/60 text-muted-foreground hover:bg-muted/40',
            )}
          >
            <span className="min-w-0 break-words">{label(group)}</span>
            <span className="shrink-0 tabular-nums text-foreground">{group.sets}</span>
          </button>
        ))}
      </div>

      {withoutDrawing.length > 0 && (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {es ? 'Sin zona propia en el dibujo: ' : 'No dedicated drawing region: '}
          {withoutDrawing.map(group => `${label(group)} (${group.sets})`).join(' · ')}
        </p>
      )}

      {(activity.unmapped.length > 0 || activity.withoutMuscleSets > 0) && (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          {es ? 'Sin zona específica en el mapa: ' : 'Without a specific map region: '}
          {[
            ...activity.unmapped.map(item => `${item.label} (${item.sets})`),
            ...(activity.withoutMuscleSets ? [`${es ? 'grupo no registrado' : 'unrecorded muscle group'} (${activity.withoutMuscleSets})`] : []),
          ].join(' · ')}
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {es ? 'Una serie puede involucrar varios grupos. El color compara sus series, no mide recuperación.' : 'A set can involve several groups. Color compares their sets; it does not measure recovery.'}
      </p>
      <p className="mt-2 text-[10px] text-muted-foreground">
        <a href="/third-party/MuscleMap-LICENSE.txt" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline decoration-border underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">MuscleMap · © Melih Colpan · MIT</a>
      </p>
    </div>
  )
}
