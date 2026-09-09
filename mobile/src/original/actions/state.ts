import { getAppStore, type AppState } from '../storage'
export type Row = Record<string, any>
export type State = AppState
export const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export const rows = (state: State, name: string): Row[] => (state.tables[name] ??= [])
export const owner = (state: State) => state.accountId
export function profile(state: State): Row {
  const found = rows(state, 'profiles').find(row => row.id === owner(state))
  if (!found) throw new Error('Perfil no encontrado')
  return found
}
export async function mutate<T>(fn: (state: State) => T | Promise<T>): Promise<T> {
  return (await getAppStore()).mutate(fn)
}
export async function read(): Promise<State> {
  const state = await (await getAppStore()).read()
  if (!state) throw new Error('No hay perfil local')
  return state
}
export function ownedPlan(state: State, id: string, editable = false): Row {
  const found = rows(state, 'workout_plans').find(row => row.id === id && row.user_id === owner(state) && !row.retired_at && !row.superseded_at)
  if (!found) throw new Error('save_failed')
  if (editable && found.prescription_locked) throw new Error('plan_locked')
  return found
}
export function ownedWorkout(state: State, id: string, planId?: string): Row {
  const found = rows(state, 'workouts').find(row => row.id === id && row.user_id === owner(state) && (!planId || row.plan_id === planId))
  if (!found) throw new Error('save_failed')
  return found
}
export function touch(plan: Row) {
  plan.plan_context = 'manual_update'
  plan.manually_updated_at = new Date().toISOString()
}
export function checkPlanLimit(state: State, replacing?: string | null) {
  if (profile(state).subscription_tier === 'pro') return
  const personal = rows(state, 'workout_plans').filter(row => row.user_id === owner(state) && row.library_slot === 'personal' && !row.retired_at && !row.superseded_at)
  if (replacing && personal.some(row => row.family_id === replacing)) return
  if (personal.length >= 2) throw new Error('plan_limit')
}

/** Read-only query subset for original pure business helpers, against one atomic draft. */
export function stateClient(state: State): any {
  const join = (table: string, row: Row): Row => {
    if (table === 'exercise_logs') return { ...row, progress_logs: rows(state, 'progress_logs').find(item => item.id === row.progress_log_id), exercise: rows(state, 'exercises').find(item => item.id === row.exercise_id) }
    if (table === 'workout_exercises') return { ...row, exercise: rows(state, 'exercises').find(item => item.id === row.exercise_id) }
    return { ...row }
  }
  const valueAt = (row: Row, key: string) => key.split('.').reduce<any>((value, part) => value?.[part], row)
  return {
    auth: { getUser: async () => ({ data: { user: { id: owner(state), email: state.email } }, error: null }) },
    from(table: string) {
      let data = rows(state, table).map(row => join(table, row))
      let single = false; let countOnly = false
      const query: any = {
        select(_columns?: string, options?: { head?: boolean }) { countOnly = options?.head === true; return query },
        eq(key: string, value: unknown) { data = data.filter(row => valueAt(row, key) === value); return query },
        neq(key: string, value: unknown) { data = data.filter(row => valueAt(row, key) !== value); return query },
        is(key: string, value: unknown) { data = data.filter(row => value == null ? valueAt(row, key) == null : valueAt(row, key) === value); return query },
        in(key: string, values: unknown[]) { data = data.filter(row => values.includes(valueAt(row, key))); return query },
        gte(key: string, value: any) { data = data.filter(row => valueAt(row, key) >= value); return query },
        lt(key: string, value: any) { data = data.filter(row => valueAt(row, key) < value); return query },
        order(key: string, options?: { ascending?: boolean }) { data.sort((a, b) => (valueAt(a, key) < valueAt(b, key) ? -1 : valueAt(a, key) > valueAt(b, key) ? 1 : 0) * (options?.ascending === false ? -1 : 1)); return query },
        limit(limit: number) { data = data.slice(0, limit); return query },
        maybeSingle() { single = true; return query },
        single() { single = true; return query },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve({ data: countOnly ? null : single ? data[0] ?? null : data, count: data.length, error: null }).then(resolve) },
      }
      return query
    },
  }
}
