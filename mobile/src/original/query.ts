import { getAppStore } from './storage'
import type { AppRow, AppState, AppStore } from './types'

export type AppQueryError = { message: string; code: string }
export type AppQueryResult<T = AppRow[]> = { data: T | null; error: AppQueryError | null; count: number | null }
type ReadStore = () => Promise<AppStore>
type Join = { alias: string; table: string; selection: string; inner: boolean }
type RowOrder = { column: string; ascending: boolean; nullsFirst: boolean }
type QueryOrder = RowOrder & { referencedTable?: string }
type OrderScope = { orders: RowOrder[]; relations: Map<string, OrderScope> }
type Filter = (row: AppRow) => boolean

const KNOWN_TABLES = new Set([
  'workout_schedule_overrides',
  'profiles', 'public_profiles', 'workout_plans', 'workouts', 'workout_exercises', 'exercises',
  'progress_logs', 'exercise_logs', 'measurements', 'dashboard_banners', 'notifications',
  'product_notifications', 'product_notification_preferences', 'notification_preferences', 'social_notification_preferences',
  'coaching_relationships', 'coaching_consents', 'trainer_plan_assignments', 'trainer_plan_assignment_versions', 'trainer_assignment_versions',
  'trainer_plan_versions', 'trainer_profiles', 'trainer_services', 'active_trainer_directory',
  'session_authorizations', 'session_drafts', 'session_results', 'plan_generation_requests',
])
const FOREIGN_KEYS: Record<string, string> = {
  exercises: 'exercise_id', workouts: 'workout_id', workout_plans: 'plan_id', progress_logs: 'progress_log_id',
  coaching_relationships: 'relationship_id', trainer_plan_assignments: 'assignment_id',
}
const OWNED = new Set(['workout_schedule_overrides', 'workout_plans', 'workouts', 'progress_logs', 'measurements', 'notifications', 'product_notifications', 'product_notification_preferences', 'notification_preferences', 'social_notification_preferences', 'session_authorizations', 'session_drafts', 'session_results', 'plan_generation_requests'])

function unsupported(operation: string): never { throw new Error(`Unsupported local database operation: ${operation}`) }
function valueAt(row: AppRow, path: string, selection: string): unknown {
  let value: unknown = row
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object') return undefined
    const joins = parseJoins(selection)
    const exact = joins.find(join => join.alias === key)
    const canonical = joins.filter(join => join.table === key)
    // Original pages use the relation table in filters even when selecting an alias.
    if (!exact && canonical.length > 1) unsupported(`ambiguous relationship filter ${key}`)
    const relation = exact ?? canonical[0]
    value = (value as AppRow)[relation?.alias ?? key]
    selection = relation?.selection ?? '*'
  }
  return value
}
function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}
function ilikePattern(pattern: string): RegExp {
  let expression = ''
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index]
    if (char === '%' || char === '*') expression += '.*'
    else if (char === '_') expression += '.'
    else {
      const literal = char === '\\' && index + 1 < pattern.length ? pattern[++index] : char
      expression += literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${expression}$`, 'iu')
}

function scopedRows(state: AppState, table: string): AppRow[] {
  if (!KNOWN_TABLES.has(table) && !Object.hasOwn(state.tables, table)) unsupported(`table ${table}`)
  return (state.tables[table] ?? []).filter(row => {
    if (table === 'profiles') return row.id === state.accountId
    if (OWNED.has(table)) return row.user_id === state.accountId
    if (table === 'workout_exercises') return scopedRows(state, 'workouts').some(parent => parent.id === row.workout_id)
    if (table === 'exercise_logs') return scopedRows(state, 'progress_logs').some(parent => parent.id === row.progress_log_id)
    if (table === 'coaching_relationships' || table === 'trainer_plan_assignments') return row.client_user_id === state.accountId || row.trainer_user_id === state.accountId
    if (table === 'coaching_consents') return scopedRows(state, 'coaching_relationships').some(parent => parent.id === row.relationship_id)
    if (table === 'exercises') return row.is_public === true || row.user_id === state.accountId || row.user_id == null
    return true
  })
}

function parseJoins(selection: string): Join[] {
  const parts: string[] = []
  let depth = 0; let start = 0
  for (let index = 0; index < selection.length; index++) {
    if (selection[index] === '(') depth++
    if (selection[index] === ')') depth--
    if (depth < 0) unsupported('malformed select')
    if (selection[index] === ',' && depth === 0) { parts.push(selection.slice(start, index).trim()); start = index + 1 }
  }
  if (depth !== 0) unsupported('malformed select')
  parts.push(selection.slice(start).trim())
  return parts.flatMap(part => {
    if (!part.includes('(')) return []
    const match = /^(?:(\w+)\s*:\s*)?(\w+)(?:!([\w!]+))?\s*\((.*)\)$/s.exec(part)
    if (!match) unsupported(`select relationship ${part}`)
    const [, alias, table, modifier = '', nested] = match
    return [{ alias: alias || table, table, selection: nested, inner: modifier.split('!').includes('inner') }]
  })
}

function orderScope(selection: string, orders: QueryOrder[]): OrderScope {
  const root: OrderScope = { orders: [], relations: new Map() }
  for (const order of orders) {
    let scope = root; let nestedSelection = selection
    for (const key of order.referencedTable === undefined ? [] : order.referencedTable.split('.')) {
      const joins = parseJoins(nestedSelection)
      const exact = joins.find(join => join.alias === key)
      const canonical = joins.filter(join => join.table === key)
      if (!exact && canonical.length > 1) unsupported(`ambiguous relationship ordering ${key}`)
      const relation = exact ?? canonical[0]
      if (!relation) unsupported(`relationship ordering ${key}`)
      if (!scope.relations.has(relation.alias)) scope.relations.set(relation.alias, { orders: [], relations: new Map() })
      scope = scope.relations.get(relation.alias)!
      nestedSelection = relation.selection
    }
    scope.orders.push(order)
  }
  return root
}

function sortRows(rows: AppRow[], selection: string, orders: RowOrder[]): void {
  rows.sort((a, b) => {
    for (const order of orders) {
      const av = valueAt(a, order.column, selection); const bv = valueAt(b, order.column, selection)
      if (av == null && bv == null) continue
      if (av == null) return order.nullsFirst ? -1 : 1
      if (bv == null) return order.nullsFirst ? 1 : -1
      const compared = compare(av, bv) * (order.ascending ? 1 : -1)
      if (compared) return compared
    }
    return 0
  })
}

function joinedRows(state: AppState, table: string, selection: string, rows = scopedRows(state, table), scope?: OrderScope): AppRow[] {
  const joins = parseJoins(selection)
  return rows.flatMap(original => {
    const row = { ...original }
    for (const join of joins) {
      const relationKey = FOREIGN_KEYS[join.table]
      let related: AppRow[]; let many = false
      if (relationKey && Object.hasOwn(original, relationKey)) {
        related = scopedRows(state, join.table).filter(candidate => candidate.id === original[relationKey])
      } else {
        const reverseKey = FOREIGN_KEYS[table]
        if (!reverseKey) unsupported(`relationship ${table} -> ${join.table}`)
        many = true
        related = scopedRows(state, join.table).filter(candidate => candidate[reverseKey] === original.id)
      }
      const nestedScope = scope?.relations.get(join.alias)
      const nested = joinedRows(state, join.table, join.selection, related, nestedScope)
      // PostgREST embedded ordering shapes the relation, not its parent rows.
      if (nestedScope) sortRows(nested, join.selection, nestedScope.orders)
      if (join.inner && nested.length === 0) return []
      row[join.alias] = many ? nested : nested[0] ?? null
    }
    return [row]
  })
}

export class AppQuery implements PromiseLike<AppQueryResult> {
  private selection = '*'
  private filters: Filter[] = []
  private orders: QueryOrder[] = []
  private offset = 0
  private maximum = Infinity
  private countRequested = false
  private head = false

  constructor(private readonly getStore: ReadStore, private readonly table: string, private readonly accountScope: Promise<string | null>) {}
  select(columns = '*', options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }): this {
    this.selection = columns; this.countRequested = Boolean(options?.count); this.head = options?.head === true; return this
  }
  eq(column: string, value: unknown): this { this.filters.push(row => valueAt(row, column, this.selection) === value); return this }
  neq(column: string, value: unknown): this { this.filters.push(row => valueAt(row, column, this.selection) != null && value != null && valueAt(row, column, this.selection) !== value); return this }
  is(column: string, value: null | boolean): this { this.filters.push(row => value === null ? valueAt(row, column, this.selection) == null : valueAt(row, column, this.selection) === value); return this }
  in(column: string, values: readonly unknown[]): this { this.filters.push(row => values.includes(valueAt(row, column, this.selection))); return this }
  ilike(column: string, pattern: string): this {
    const matches = ilikePattern(pattern)
    this.filters.push(row => { const value = valueAt(row, column, this.selection); return typeof value === 'string' && matches.test(value) }); return this
  }
  contains(column: string, values: readonly unknown[]): this {
    if (!Array.isArray(values)) unsupported('contains; only array containment is supported locally')
    this.filters.push(row => { const value = valueAt(row, column, this.selection); return Array.isArray(value) && values.every(item => value.includes(item)) }); return this
  }
  or(expression: string): this {
    const clauses = expression.split(',').map(clause => {
      const match = /^(\w+)\.ilike\.(.*)$/.exec(clause)
      if (!match) unsupported(`or filter ${clause}`)
      return { column: match[1], pattern: ilikePattern(match[2]) }
    })
    this.filters.push(row => clauses.some(({ column, pattern }) => {
      const value = valueAt(row, column, this.selection)
      return typeof value === 'string' && pattern.test(value)
    })); return this
  }
  private comparison(column: string, value: unknown, predicate: (order: number) => boolean): this {
    this.filters.push(row => valueAt(row, column, this.selection) != null && value != null && predicate(compare(valueAt(row, column, this.selection), value))); return this
  }
  gte(column: string, value: unknown): this { return this.comparison(column, value, order => order >= 0) }
  lte(column: string, value: unknown): this { return this.comparison(column, value, order => order <= 0) }
  gt(column: string, value: unknown): this { return this.comparison(column, value, order => order > 0) }
  lt(column: string, value: unknown): this { return this.comparison(column, value, order => order < 0) }
  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string; foreignTable?: string }): this {
    const ascending = options?.ascending !== false
    this.orders.push({ column, ascending, nullsFirst: options?.nullsFirst ?? !ascending,
      referencedTable: options?.referencedTable ?? options?.foreignTable }); return this
  }
  limit(maximum: number): this {
    if (!Number.isSafeInteger(maximum) || maximum < 0) unsupported('invalid limit')
    this.maximum = maximum; return this
  }
  range(from: number, to: number): this {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) unsupported('invalid range')
    this.offset = from; this.maximum = to - from + 1; return this
  }
  insert(_value: unknown): never { return unsupported('insert; use the local action transaction') }
  update(_value: unknown): never { return unsupported('update; use the local action transaction') }
  upsert(_value: unknown): never { return unsupported('upsert; use the local action transaction') }
  delete(): never { return unsupported('delete; use the local action transaction') }

  private async execute(): Promise<AppQueryResult> {
    const accountId = await this.accountScope
    const state = await (await this.getStore()).read()
    if (!state) return { data: null, error: { message: 'No active local account', code: '28000' }, count: null }
    if (state.accountId !== accountId) return { data: null, error: { message: 'Local account changed; reload this screen', code: '28000' }, count: null }
    const scope = orderScope(this.selection, this.orders)
    let rows = joinedRows(state, this.table, this.selection, undefined, scope).filter(row => this.filters.every(filter => filter(row)))
    const count = this.countRequested ? rows.length : null
    sortRows(rows, this.selection, scope.orders)
    rows = rows.slice(this.offset, Number.isFinite(this.maximum) ? this.offset + this.maximum : undefined)
    return { data: this.head ? null : rows, error: null, count }
  }
  async maybeSingle(): Promise<AppQueryResult<AppRow>> { return this.one(false) }
  async single(): Promise<AppQueryResult<AppRow>> { return this.one(true) }
  private async one(required: boolean): Promise<AppQueryResult<AppRow>> {
    const result = await this.execute()
    if (result.error) return { ...result, data: null }
    const rows = result.data ?? []
    if (rows.length > 1 || (required && rows.length !== 1)) return { data: null, count: result.count, error: { message: 'Expected a single local row', code: 'PGRST116' } }
    return { data: rows[0] ?? null, error: null, count: result.count }
  }
  then<TResult1 = AppQueryResult, TResult2 = never>(
    onfulfilled?: ((value: AppQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> { return this.execute().then(onfulfilled, onrejected) }
}

export function createAppClient(store?: AppStore) {
  const getStore = store ? async () => store : getAppStore
  const accountScope = getStore().then(current => current.read()).then(state => state?.accountId ?? null)
  return {
    from: (table: string) => new AppQuery(getStore, table, accountScope),
    rpc: async (name: string, _args?: unknown): Promise<AppQueryResult> => ({
      data: null, error: { code: '0A000', message: `Unsupported local RPC: ${name}; use its local fallback or connect online.` }, count: null,
    }),
  }
}
