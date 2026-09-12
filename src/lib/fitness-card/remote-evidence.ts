import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCompleteProgressHistory } from '@/lib/progress/historyPagination'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'
import type { FitnessEvidence } from './types'
import { projectFitnessCard } from './projection'

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

export type LocalFitnessEvidenceState = {
  accountId: string
  remoteUserId: string | null
  remoteRevision: string | null
  tables: Tables
}

type QueryResult<T> = { data: T | null; error: { message?: string } | null }

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((row): row is Row => row !== null && typeof row === 'object' && !Array.isArray(row)) : []
}

function mergeRows(sources: Row[][]): Row[] {
  const merged = new Map<string, Row>()
  let anonymous = 0
  for (const source of sources) {
    for (const row of source) {
      const key = typeof row.id === 'string' && row.id ? `id:${row.id}` : `anonymous:${anonymous++}`
      merged.set(key, row)
    }
  }
  return Array.from(merged.values())
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Row).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
  return JSON.stringify(value)
}

function mergeCanonicalTables(local: Tables, incoming: Tables): Tables {
  const merged: Tables = structuredClone(local)
  const baseValue = rows(local.mobile_web_base)[0]?.tables
  const base = baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue) ? baseValue as Tables : {}
  for (const [table, remoteRows] of Object.entries(incoming)) {
    const before = new Map(rows(base[table]).flatMap(row => typeof row.id === 'string' ? [[row.id, row] as const] : []))
    const present = new Set(rows(local[table]).flatMap(row => typeof row.id === 'string' ? [row.id] : []))
    const remote = new Map(remoteRows.flatMap(row => typeof row.id === 'string' ? [[row.id, row] as const] : []))
    const result = rows(local[table]).flatMap(localRow => {
      if (typeof localRow.id !== 'string') return [localRow]
      const previous = before.get(localRow.id)
      const next = remote.get(localRow.id)
      if (!next) return previous && stable(previous) === stable(localRow) ? [] : [localRow]
      if (!previous) return [localRow]
      // A performed set is one atomic observation. Combining local weight with
      // remotely corrected reps/status can manufacture a result neither saved.
      if (table === 'exercise_logs') return [stable(previous) === stable(localRow) ? next : localRow]
      const value = { ...localRow }
      for (const field of Array.from(new Set([...Object.keys(previous), ...Object.keys(next)]))) {
        if (stable(localRow[field]) !== stable(previous[field])) continue
        if (Object.hasOwn(next, field)) value[field] = next[field]
        else delete value[field]
      }
      return [value]
    })
    for (const row of remoteRows) {
      if (typeof row.id !== 'string' || (!present.has(row.id) && !before.has(row.id))) result.push(row)
    }
    merged[table] = result
  }
  return merged
}

function checkedSnapshot(payload: unknown, ownerId: string): Tables {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Fitness evidence snapshot is invalid.')
  const value = payload as Row
  if (value.accountId !== ownerId || value.remoteUserId !== ownerId) throw new Error('Fitness evidence snapshot account does not match the authenticated owner.')
  if (value.tables === null || typeof value.tables !== 'object' || Array.isArray(value.tables)) throw new Error('Fitness evidence snapshot tables are invalid.')
  const tables = value.tables as Record<string, unknown>
  return Object.fromEntries(Object.entries(tables).map(([name, value]) => [name, rows(value)]))
}

function checkedLocal(local: LocalFitnessEvidenceState | undefined, ownerId: string): Tables {
  if (!local) return {}
  if (local.accountId !== ownerId || local.remoteUserId !== ownerId) throw new Error('Local fitness evidence account does not match the authenticated owner.')
  return local.tables
}

async function loadCatalog(client: SupabaseClient, exerciseIds: string[]): Promise<Row[]> {
  const result: Row[] = []
  for (let start = 0; start < exerciseIds.length; start += 100) {
    const ids = exerciseIds.slice(start, start + 100)
    for (let from = 0; ; from += 300) {
      const page = await (client.from('exercises') as any).select('*').in('id', ids).order('id').range(from, from + 299) as QueryResult<Row[]>
      if (page.error) throw new Error(page.error.message ?? 'Could not load exercise catalog')
      const values = page.data ?? []
      result.push(...values)
      if (values.length < 300) break
    }
  }
  return result
}

export async function loadConnectedFitnessEvidence(
  client: SupabaseClient,
  ownerId: string,
  now = new Date(),
  local?: LocalFitnessEvidenceState,
): Promise<FitnessEvidence> {
  const localTables = checkedLocal(local, ownerId)
  const [history, profileResult, snapshotResult] = await Promise.all([
    loadCompleteProgressHistory<Row & { id: string }, Row>({
      loadLogPage: async (from, to) => await (client.from('progress_logs') as any)
        .select('*').eq('user_id', ownerId).order('completed_at', { ascending: false }).order('id', { ascending: true }).range(from, to),
      loadExercisePage: async (logIds, from, to) => await (client.from('exercise_logs') as any)
        .select('*,exercise:exercises(*)').in('progress_log_id', logIds).order('progress_log_id', { ascending: true }).order('id', { ascending: true }).range(from, to),
    }),
    (client.from('profiles') as any).select('*').eq('id', ownerId).maybeSingle() as Promise<QueryResult<Row>>,
    (client as any).rpc('original_app_snapshot_read_v1') as Promise<QueryResult<unknown>>,
  ])
  if (profileResult.error) throw new Error(profileResult.error.message ?? 'Could not load fitness profile')
  if (snapshotResult.error) throw new Error(snapshotResult.error.message ?? 'Could not load original app snapshot')

  const snapshotRow = Array.isArray(snapshotResult.data) ? snapshotResult.data[0] : snapshotResult.data
  const snapshotRevision = snapshotRow && typeof snapshotRow === 'object' && !Array.isArray(snapshotRow) && typeof (snapshotRow as Row).revision === 'string'
    ? (snapshotRow as Row).revision as string : null
  if (local && snapshotRevision !== null && local.remoteRevision !== snapshotRevision) throw new Error('FITNESS_CARD_NEEDS_SYNC')
  const snapshotPayload = snapshotRow && typeof snapshotRow === 'object' && !Array.isArray(snapshotRow) ? (snapshotRow as Row).payload : null
  const snapshotTables = snapshotPayload === null || snapshotPayload === undefined ? {} : checkedSnapshot(snapshotPayload, ownerId)

  if (local) {
    const exerciseIds = Array.from(new Set([...history.exerciseLogs, ...rows(localTables.exercise_logs)].flatMap(row => typeof row.exercise_id === 'string' ? [row.exercise_id] : [])))
    const canonicalCatalog = await loadCatalog(client, exerciseIds)
    const tables = mergeCanonicalTables(localTables, {
      profiles: profileResult.data ? [profileResult.data] : [],
      progress_logs: history.logs,
      exercise_logs: history.exerciseLogs,
      exercises: canonicalCatalog,
    })
    const profile = rows(tables.profiles).find(row => row.id === ownerId) ?? profileResult.data ?? {}
    return projectFitnessCard({ ownerId, logs: rows(tables.progress_logs), exerciseLogs: rows(tables.exercise_logs), exercises: rows(tables.exercises),
      timeZone: resolveUserTimeZone(typeof profile.timezone === 'string' ? profile.timezone : null), language: profile.language === 'en' ? 'en' : 'es', now })
  }

  const base = rows(snapshotTables.mobile_web_base)[0]?.tables
  const baselineLogs = base && typeof base === 'object' && !Array.isArray(base) ? rows((base as Record<string, unknown>).progress_logs) : []
  const canonicalIds = new Set(history.logs.map(row => row.id))
  const sessionKey = (row: Row) => typeof row.client_session_id === 'string' && row.client_session_id.trim() ? row.client_session_id : null
  const canonicalSessions = new Set(history.logs.flatMap(row => sessionKey(row) ? [sessionKey(row)] : []))
  const baselineIds = new Set(baselineLogs.map(row => row.id))
  const baselineSessions = new Set(baselineLogs.flatMap(row => sessionKey(row) ? [sessionKey(row)] : []))
  // Rows known to have come from the web base must follow the current web state.
  // Unknown snapshot-only rows remain mobile evidence; without a web base their
  // deletion provenance cannot be reconstructed, so no invented timestamp wins.
  const mobileLogs = rows(snapshotTables.progress_logs).filter(row => row.user_id === ownerId && !canonicalIds.has(row.id as string)
    && !(sessionKey(row) && canonicalSessions.has(sessionKey(row))) && !baselineIds.has(row.id)
    && !(sessionKey(row) && baselineSessions.has(sessionKey(row))))
  const mobileIds = new Set(mobileLogs.map(row => row.id))
  const mobileDetails = rows(snapshotTables.exercise_logs).filter(row => mobileIds.has(row.progress_log_id))
  const exerciseIds = Array.from(new Set([
    ...history.exerciseLogs,
    ...mobileDetails,
  ].flatMap(row => typeof row.exercise_id === 'string' ? [row.exercise_id] : [])))
  const canonicalCatalog = await loadCatalog(client, exerciseIds)
  const profile = profileResult.data ?? {}

  return projectFitnessCard({
    ownerId,
    logs: [...history.logs, ...mobileLogs],
    exerciseLogs: [...history.exerciseLogs, ...mobileDetails],
    exercises: mergeRows([rows(snapshotTables.exercises), canonicalCatalog]),
    timeZone: resolveUserTimeZone(typeof profile.timezone === 'string' ? profile.timezone : null),
    language: profile.language === 'en' ? 'en' : 'es',
    now,
  })
}
