import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireAppUserContext } from '@/lib/auth/server'
import {
  getExercises,
  getDistinctMuscleGroups,
  getDistinctEquipment,
} from '@/lib/exercises/service'
import { TYPE_CFG } from './config'
import ExerciseFilters from './ExerciseFilters'
import ExerciseGrid from './ExerciseGrid'
import type { Difficulty, ExerciseType } from '@/types/exercise'
import { exerciseLanguage, localizeEquipment, localizeMuscleGroup } from '@/lib/exercises/localization'
import { createTranslator } from '@/lib/i18n'

// ─── Dev guard ────────────────────────────────────────────────────────────────

function isDevAccess(email: string | undefined): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  const allowed = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return allowed.includes((email ?? '').toLowerCase())
}

// ─── Stat strip ───────────────────────────────────────────────────────────────

function StatStrip({ total, page, totalPages, t }: { total: number; page: number; totalPages: number; t: (source: string) => string }) {
  return (
    <div className="flex items-center gap-5">
      <div className="text-center">
        <div className="text-2xl font-bold text-white tabular-nums">{total.toLocaleString()}</div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{t('Ejercicios')}</div>
      </div>
      <div className="w-px h-8 bg-zinc-800" />
      <div className="text-center">
        <div className="text-2xl font-bold text-white tabular-nums">
          {page}<span className="text-zinc-600 text-base">/{totalPages}</span>
        </div>
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{t('Página')}</div>
      </div>
      <div className="w-px h-8 bg-zinc-800 hidden lg:block" />
      <div className="hidden lg:flex items-center gap-3.5">
        {Object.values(TYPE_CFG).map(cfg => (
          <div key={cfg.label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
            <span className="text-[11px] text-zinc-400">{t(cfg.label)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, totalPages, sp, t }: { page: number; totalPages: number; sp: Record<string, string>; t: (source: string) => string }) {
  if (totalPages <= 1) return null

  const href = (p: number) => `/exercises?${new URLSearchParams({ ...sp, page: String(p) })}`

  const pages: (number | '…')[] = []
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) pages.push(i)
    else if (pages[pages.length - 1] !== '…') pages.push('…')
  }

  const navCls = 'h-9 px-3.5 flex items-center text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-700 rounded-xl border border-zinc-700 hover:border-zinc-600 transition-colors'
  const deadCls = 'h-9 px-3.5 flex items-center text-sm text-zinc-700 bg-zinc-800/20 rounded-xl border border-zinc-800 cursor-not-allowed'

  return (
    <div className="flex items-center justify-center gap-1.5 mt-12">
      {page > 1
        ? <Link href={href(page - 1)} className={navCls}>← {t('Anterior')}</Link>
        : <span className={deadCls}>← {t('Anterior')}</span>}

      <div className="flex items-center gap-1 mx-1">
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`el-${i}`} className="w-9 text-center text-zinc-600">…</span>
          ) : (
            <Link
              key={p}
              href={href(p)}
              className={`w-9 h-9 flex items-center justify-center text-sm rounded-xl border font-medium transition-colors ${
                p === page
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'text-zinc-400 hover:text-white bg-zinc-800/60 hover:bg-zinc-700 border-zinc-700 hover:border-zinc-600'
              }`}
            >
              {p}
            </Link>
          )
        )}
      </div>

      {page < totalPages
        ? <Link href={href(page + 1)} className={navCls}>{t('Siguiente')} →</Link>
        : <span className={deadCls}>{t('Siguiente')} →</span>}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ExercisesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>
}) {
  const { user, profile } = await requireAppUserContext()
  if (!isDevAccess(user?.email)) notFound()
  const language = exerciseLanguage(profile.language)
  const t = createTranslator(language)

  const sp             = await searchParams
  const page           = Math.max(1, parseInt(sp.page ?? '1', 10))
  const search         = sp.search         ?? ''
  const difficulty     = sp.difficulty     ?? ''
  const exercise_type  = sp.exercise_type  ?? ''
  const muscle_group   = sp.muscle_group   ?? ''
  const equipment      = sp.equipment      ?? ''

  const [result, muscleGroups, equipmentList] = await Promise.all([
    getExercises({
      search:        search        || undefined,
      difficulty:    difficulty    as Difficulty    | '' || undefined,
      exercise_type: exercise_type as ExerciseType  | '' || undefined,
      muscle_group:  muscle_group  || undefined,
      equipment:     equipment     || undefined,
      page,
    }, language),
    getDistinctMuscleGroups(),
    getDistinctEquipment(),
  ])

  const { exercises, total, totalPages } = result
  const rawSp = { search, difficulty, exercise_type, muscle_group, equipment }

  return (
    <div className="min-h-screen bg-[#0e0e10] text-white">

      {/* ── Sticky toolbar ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-[#0e0e10]/95 backdrop-blur-md border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between py-4 gap-4">
            <h1 className="text-xl font-bold tracking-tight shrink-0">{t('Biblioteca de ejercicios')}</h1>
            <StatStrip total={total} page={page} totalPages={totalPages} t={t} />
          </div>
          <div className="pb-3">
            <ExerciseFilters
              muscleGroups={muscleGroups.map(value => ({ value, label: localizeMuscleGroup(value, language) }))}
              equipmentList={equipmentList.map(value => ({ value, label: localizeEquipment(value, language) }))}
              current={{ search, difficulty, exercise_type, muscle_group, equipment }}
              total={total}
            />
          </div>
        </div>
      </div>

      {/* ── Grid + Modal ─────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {exercises.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
            <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-4xl">
              🔍
            </div>
            <div>
              <p className="text-base font-semibold text-white">{t('No se encontraron ejercicios')}</p>
              <p className="text-sm text-zinc-500 mt-1">{t('Prueba a cambiar o limpiar los filtros')}</p>
            </div>
            <Link href="/exercises" className="text-sm text-orange-400 hover:text-orange-300 underline underline-offset-2">
              {t('Limpiar todos los filtros')}
            </Link>
          </div>
        ) : (
          <ExerciseGrid exercises={exercises} />
        )}

        <Pagination page={page} totalPages={totalPages} sp={rawSp} t={t} />
      </div>
    </div>
  )
}
