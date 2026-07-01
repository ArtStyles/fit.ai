/**
 * Exercise service — thin wrapper around the Supabase `exercises` table.
 *
 * All functions are server-side only (they call createClient which uses
 * next/headers under the hood).  Import them only from Server Components,
 * Server Actions, or Route Handlers.
 */

import { createClient } from '@/lib/supabase/server'
import type { Exercise, ExerciseFilters, ExercisePage } from '@/types/exercise'
import { localizeExercise, type ExerciseLanguage } from './localization'

const DEFAULT_LIMIT = 24

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Cast helper — avoids repeating the verbose supabase-js v2 workaround. */
// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Paginated, filtered list of public exercises.
 */
export async function getExercises(
  filters: ExerciseFilters = {},
  language: ExerciseLanguage = 'es',
): Promise<ExercisePage> {
  const supabase = await createClient()

  const {
    search,
    difficulty,
    exercise_type,
    muscle_group,
    equipment,
    is_compound,
    page = 1,
    limit = DEFAULT_LIMIT,
  } = filters

  const from = (page - 1) * limit
  const to   = from + limit - 1

  // Build base query
  const query = (supabase as unknown as {
    from: (t: string) => unknown
  })
    .from('exercises') as ReturnType<typeof supabase.from>

  // Always restrict to public exercises (honours RLS too)
  let q = query.select('*', { count: 'exact' }).eq('is_public', true)

  if (search?.trim()) {
    const term = search.trim().replace(/[^a-zA-Z0-9À-ÿ\s'’_-]/g, '')
    q = language === 'es'
      ? q.or(`name.ilike.%${term}%,name_es.ilike.%${term}%`)
      : q.ilike('name', `%${term}%`)
  }
  if (difficulty) {
    q = q.eq('difficulty', difficulty)
  }
  if (exercise_type) {
    q = q.eq('exercise_type', exercise_type)
  }
  if (muscle_group) {
    // Postgres array contains operator via PostgREST
    q = q.contains('muscle_groups', [muscle_group])
  }
  if (equipment) {
    q = q.contains('equipment', [equipment])
  }
  if (is_compound !== undefined) {
    q = q.eq('is_compound', is_compound)
  }

  q = q.order('name', { ascending: true }).range(from, to)

  const { data, error, count } = await (q as unknown as Promise<{
    data: Exercise[] | null
    error: { message: string } | null
    count: number | null
  }>)

  if (error) throw new Error(error.message)

  const total = count ?? 0

  return {
    exercises: (data ?? []).map(exercise => localizeExercise(exercise, language)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * Single exercise by UUID.
 */
export async function getExerciseById(
  id: string,
  language: ExerciseLanguage = 'es',
): Promise<Exercise | null> {
  const supabase = await createClient()

  const result = await supabase
    .from('exercises')
    .select('*')
    .eq('id', id)
    .eq('is_public', true)
    .single() as unknown as { data: Exercise | null; error: { message: string } | null }

  if (result.error && result.error.message !== 'JSON object requested, multiple (or no) rows returned') {
    throw new Error(result.error.message)
  }

  return result.data ? localizeExercise(result.data, language) : null
}

/**
 * Name search — returns up to `limit` exercises matching the query string.
 * Useful for autocomplete / quick lookups.
 */
export async function searchExercises(
  query: string,
  limit = 10,
  language: ExerciseLanguage = 'es',
): Promise<Exercise[]> {
  if (!query.trim()) return []

  const supabase = await createClient()

  let request = supabase
    .from('exercises')
    .select('*')
    .eq('is_public', true)
  const term = query.trim().replace(/[^a-zA-Z0-9À-ÿ\s'’_-]/g, '')
  request = language === 'es'
    ? request.or(`name.ilike.%${term}%,name_es.ilike.%${term}%`)
    : request.ilike('name', `%${term}%`)

  const result = await request
    .order('name', { ascending: true })
    .limit(limit) as unknown as { data: Exercise[] | null; error: { message: string } | null }

  if (result.error) throw new Error(result.error.message)
  return (result.data ?? []).map(exercise => localizeExercise(exercise, language))
}

/**
 * Fetch a specific set of exercises by their UUIDs (e.g. to populate a plan).
 * Preserves the order of the input array.
 */
export async function getExercisesByIds(
  ids: string[],
  language: ExerciseLanguage = 'es',
): Promise<Exercise[]> {
  if (ids.length === 0) return []

  const supabase = await createClient()

  const result = await supabase
    .from('exercises')
    .select('*')
    .in('id', ids)
    .eq('is_public', true) as unknown as { data: Exercise[] | null; error: { message: string } | null }

  if (result.error) throw new Error(result.error.message)

  const rows = (result.data ?? []).map(exercise => localizeExercise(exercise, language))

  // Restore caller's ordering
  const map = new Map(rows.map(e => [e.id, e]))
  return ids.flatMap(id => (map.has(id) ? [map.get(id)!] : []))
}

/**
 * All distinct muscle group values present in the DB — used to populate filter
 * dropdowns without hardcoding.
 */
export async function getDistinctMuscleGroups(): Promise<string[]> {
  const supabase = await createClient()

  // PostgREST doesn't support UNNEST directly; fetch all arrays and flatten JS-side.
  // Table is small enough (~800 rows) that this is fine.
  const result = await supabase
    .from('exercises')
    .select('muscle_groups')
    .eq('is_public', true) as unknown as { data: { muscle_groups: string[] }[] | null; error: { message: string } | null }

  if (result.error) throw new Error(result.error.message)

  const all = (result.data ?? []).flatMap(row => row.muscle_groups)
  return Array.from(new Set(all)).sort()
}

/**
 * All distinct equipment values present in the DB.
 */
export async function getDistinctEquipment(): Promise<string[]> {
  const supabase = await createClient()

  const result = await supabase
    .from('exercises')
    .select('equipment')
    .eq('is_public', true) as unknown as { data: { equipment: string[] }[] | null; error: { message: string } | null }

  if (result.error) throw new Error(result.error.message)

  const all = (result.data ?? []).flatMap(row => row.equipment)
  return Array.from(new Set(all)).sort()
}
