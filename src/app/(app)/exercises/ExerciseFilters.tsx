'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useRef, useTransition } from 'react'
import type { Difficulty, ExerciseType } from '@/types/exercise'

interface Props {
  muscleGroups:  string[]
  equipmentList: string[]
  current: {
    search:         string
    difficulty:     string
    exercise_type:  string
    muscle_group:   string
    equipment:      string
  }
  total: number
}

// ─── native select ─────────────────────────────────────────────────────────────

const SELECT_CLS = `
  h-9 rounded-xl px-3 pr-8 text-sm appearance-none cursor-pointer
  border transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500/40
  bg-zinc-800/70 border-zinc-700 text-zinc-300
  hover:bg-zinc-700/70 hover:border-zinc-600
`

const SELECT_ACTIVE_CLS = `
  h-9 rounded-xl px-3 pr-8 text-sm appearance-none cursor-pointer
  border transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500/40
  bg-orange-500/15 border-orange-500/50 text-orange-300
  hover:bg-orange-500/20
`

const DIFF_OPTS: { v: Difficulty | ''; label: string }[] = [
  { v: '',             label: 'All levels'    },
  { v: 'beginner',     label: 'Beginner'      },
  { v: 'intermediate', label: 'Intermediate'  },
  { v: 'advanced',     label: 'Advanced'      },
]

const TYPE_OPTS: { v: ExerciseType | ''; label: string }[] = [
  { v: '',            label: 'All types'   },
  { v: 'strength',    label: 'Strength'    },
  { v: 'cardio',      label: 'Cardio'      },
  { v: 'flexibility', label: 'Flexibility' },
  { v: 'balance',     label: 'Balance'     },
  { v: 'hiit',        label: 'HIIT'        },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExerciseFilters({ muscleGroups, equipmentList, current }: Props) {
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
            placeholder="Search exercises…"
            className={`w-full pl-8 pr-3 h-9 rounded-xl border text-sm bg-zinc-800/70 border-zinc-700 text-white placeholder:text-zinc-500 hover:bg-zinc-700/70 hover:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500/50 transition-colors ${current.search ? 'border-orange-500/50 bg-orange-500/10 text-orange-100 placeholder:text-orange-300/40' : ''}`}
          />
        </form>

        {/* Difficulty */}
        <div className="relative">
          <select
            className={current.difficulty ? SELECT_ACTIVE_CLS : SELECT_CLS}
            value={current.difficulty}
            onChange={e => push({ difficulty: e.target.value })}
          >
            {DIFF_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>

        {/* Type */}
        <div className="relative">
          <select
            className={current.exercise_type ? SELECT_ACTIVE_CLS : SELECT_CLS}
            value={current.exercise_type}
            onChange={e => push({ exercise_type: e.target.value })}
          >
            {TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>

        {/* Muscle */}
        <div className="relative">
          <select
            className={current.muscle_group ? SELECT_ACTIVE_CLS : SELECT_CLS}
            value={current.muscle_group}
            onChange={e => push({ muscle_group: e.target.value })}
          >
            <option value="">All muscles</option>
            {muscleGroups.map(m => <option key={m} value={m} className="capitalize">{m}</option>)}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>

        {/* Equipment */}
        <div className="relative">
          <select
            className={current.equipment ? SELECT_ACTIVE_CLS : SELECT_CLS}
            value={current.equipment}
            onChange={e => push({ equipment: e.target.value })}
          >
            <option value="">All equipment</option>
            {equipmentList.map(eq => <option key={eq} value={eq} className="capitalize">{eq}</option>)}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none"
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
          </svg>
        </div>

        {/* Clear all */}
        {activeChips.length > 0 && (
          <button
            onClick={() => { if (inputRef.current) inputRef.current.value = ''; push({ search: '', difficulty: '', exercise_type: '', muscle_group: '', equipment: '' }) }}
            className="h-9 px-3 text-sm text-zinc-500 hover:text-white rounded-xl border border-transparent hover:border-zinc-700 hover:bg-zinc-800 transition-colors"
          >
            ✕ Clear
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
