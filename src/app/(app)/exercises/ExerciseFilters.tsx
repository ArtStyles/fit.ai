'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useRef, useTransition } from 'react'
import type { Difficulty, ExerciseType } from '@/types/exercise'
import { useI18n } from '@/components/i18n/I18nProvider'
import { CompactCategorySelect } from '@/components/ui/compact-category-select'

interface Props {
  muscleGroups:  { value: string; label: string }[]
  equipmentList: { value: string; label: string }[]
  current: {
    search:         string
    difficulty:     string
    exercise_type:  string
    muscle_group:   string
    equipment:      string
  }
  total: number
}

const SELECT_CLS = 'w-auto min-w-36 border-zinc-700 bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/70'
const SELECT_ACTIVE_CLS = 'w-auto min-w-36 border-orange-500/50 bg-orange-500/15 text-orange-300'

const DIFF_OPTS: { v: Difficulty | ''; label: string }[] = [
  { v: '',             label: 'Todos los niveles' },
  { v: 'beginner',     label: 'Principiante'  },
  { v: 'intermediate', label: 'Intermedio'  },
  { v: 'advanced',     label: 'Avanzado'      },
]

const TYPE_OPTS: { v: ExerciseType | ''; label: string }[] = [
  { v: '',            label: 'Todos los tipos' },
  { v: 'strength',    label: 'Fuerza'      },
  { v: 'cardio',      label: 'Cardio'      },
  { v: 'flexibility', label: 'Flexibilidad' },
  { v: 'balance',     label: 'Equilibrio'   },
  { v: 'hiit',        label: 'HIIT'        },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExerciseFilters({ muscleGroups, equipmentList, current }: Props) {
  const { t } = useI18n()
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startT] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const push = useCallback(
    (updates: Record<string, string>) => {
      const p = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(updates)) {
        if (v) p.set(k, v); else p.delete(k)
      }
      p.delete('page')
      startT(() => router.push(`/exercises?${p}`))
    },
    [router, searchParams]
  )

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    push({ search: inputRef.current?.value ?? '' })
  }

  const activeChips = [
    current.search        && { key: 'search',        label: `"${current.search}"` },
    current.difficulty    && { key: 'difficulty',    label: current.difficulty    },
    current.exercise_type && { key: 'exercise_type', label: current.exercise_type },
    current.muscle_group  && { key: 'muscle_group',  label: current.muscle_group  },
    current.equipment     && { key: 'equipment',     label: current.equipment     },
  ].filter(Boolean) as { key: string; label: string }[]

  return (
    <div className={`space-y-2.5 transition-opacity duration-150 ${isPending ? 'opacity-40 pointer-events-none' : ''}`}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Search */}
        <form onSubmit={handleSearch} className="relative flex-1 min-w-44">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
          </svg>
          <input
            ref={inputRef}
            name="search"
            defaultValue={current.search}
            placeholder={t('Buscar ejercicios…')}
            className={`w-full pl-8 pr-3 h-9 rounded-xl border text-sm bg-zinc-800/70 border-zinc-700 text-white placeholder:text-zinc-500 hover:bg-zinc-700/70 hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50 transition-colors ${current.search ? 'border-orange-500/50 bg-orange-500/10 text-orange-100 placeholder:text-orange-300/40' : ''}`}
          />
        </form>

        {/* Difficulty */}
        <CompactCategorySelect
          ariaLabel={t('Nivel')}
          value={current.difficulty}
          onValueChange={value => push({ difficulty: value })}
          allLabel={t(DIFF_OPTS[0].label)}
          options={DIFF_OPTS.slice(1).map(option => ({ value: option.v, label: t(option.label) }))}
          className={current.difficulty ? SELECT_ACTIVE_CLS : SELECT_CLS}
        />

        {/* Type */}
        <CompactCategorySelect
          ariaLabel={t('Tipo')}
          value={current.exercise_type}
          onValueChange={value => push({ exercise_type: value })}
          allLabel={t(TYPE_OPTS[0].label)}
          options={TYPE_OPTS.slice(1).map(option => ({ value: option.v, label: t(option.label) }))}
          className={current.exercise_type ? SELECT_ACTIVE_CLS : SELECT_CLS}
        />

        {/* Muscle */}
        <CompactCategorySelect
          ariaLabel={t('Músculo')}
          value={current.muscle_group}
          onValueChange={value => push({ muscle_group: value })}
          allLabel={t('Todos los músculos')}
          options={muscleGroups}
          className={current.muscle_group ? SELECT_ACTIVE_CLS : SELECT_CLS}
        />

        {/* Equipment */}
        <CompactCategorySelect
          ariaLabel={t('Equipo')}
          value={current.equipment}
          onValueChange={value => push({ equipment: value })}
          allLabel={t('Todo el equipo')}
          options={equipmentList}
          className={current.equipment ? SELECT_ACTIVE_CLS : SELECT_CLS}
        />

        {/* Clear all */}
        {activeChips.length > 0 && (
          <button
            onClick={() => { if (inputRef.current) inputRef.current.value = ''; push({ search: '', difficulty: '', exercise_type: '', muscle_group: '', equipment: '' }) }}
            className="h-9 px-3 text-sm text-zinc-500 hover:text-white rounded-xl border border-transparent hover:border-zinc-700 hover:bg-zinc-800 transition-colors"
          >
            ✕ {t('Limpiar')}
          </button>
        )}
      </div>

      {/* ── Active chips ─────────────────────────────────────────────────── */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeChips.map(chip => (
            <button
              key={chip.key}
              onClick={() => { if (chip.key === 'search' && inputRef.current) inputRef.current.value = ''; push({ [chip.key]: '' }) }}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/25 hover:bg-orange-500/25 hover:border-orange-500/40 transition-colors capitalize"
            >
              {chip.label}
              <svg className="w-2.5 h-2.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
