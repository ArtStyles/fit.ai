/**
 * Read-only aggregate audit for completed-session continuity.
 *
 * This deliberately selects only the columns needed for aggregate recovery
 * metrics. It never emits identifiers, snapshots, or other user data.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '../src/types/database'

export type HistoryAuditLog = {
  id: string
  user_id: string
  workout_id: string | null
  session_context_snapshot: unknown
}

export type HistoryAuditWorkout = { id: string }
export type HistoryAuditExerciseLog = { id: string; progress_log_id: string }

export type HistoryContinuitySummary = {
  progressLogs: number
  detachedLogs: number
  detachedLogsWithExerciseRows: number
  contextSnapshots: number
  affectedUsers: number
}

export type HistoryContinuityReader = {
  progressLogs(offset: number, limit: number): Promise<HistoryAuditLog[]>
  workouts(offset: number, limit: number): Promise<HistoryAuditWorkout[]>
  exerciseLogs(offset: number, limit: number): Promise<HistoryAuditExerciseLog[]>
}

export function summarizeHistoryContinuity({
  logs,
  workouts,
  exerciseLogs,
}: {
  logs: HistoryAuditLog[]
  workouts: HistoryAuditWorkout[]
  exerciseLogs: HistoryAuditExerciseLog[]
}): HistoryContinuitySummary {
  const workoutIds = new Set(workouts.map(workout => workout.id))
  const detachedLogs = logs.filter(log => log.workout_id === null || !workoutIds.has(log.workout_id))
  const detachedLogIds = new Set(detachedLogs.map(log => log.id))
  const detachedLogsWithExerciseRows = new Set(
    exerciseLogs
      .map(row => row.progress_log_id)
      .filter(progressLogId => detachedLogIds.has(progressLogId)),
  )

  return {
    progressLogs: logs.length,
    detachedLogs: detachedLogs.length,
    detachedLogsWithExerciseRows: detachedLogsWithExerciseRows.size,
    contextSnapshots: logs.filter(log => log.session_context_snapshot !== null).length,
    affectedUsers: new Set(detachedLogs.map(log => log.user_id)).size,
  }
}

async function readAll<T>(
  readPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize: number,
): Promise<T[]> {
  const records: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await readPage(offset, pageSize)
    records.push(...page)
    if (page.length < pageSize) return records
  }
}

export async function auditHistoryContinuity(
  reader: HistoryContinuityReader,
  output: (value: string) => void = console.log,
  pageSize = 1_000,
): Promise<HistoryContinuitySummary> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('pageSize must be a positive integer')

  const [logs, workouts, exerciseLogs] = await Promise.all([
    readAll(reader.progressLogs, pageSize),
    readAll(reader.workouts, pageSize),
    readAll(reader.exerciseLogs, pageSize),
  ])
  const summary = summarizeHistoryContinuity({ logs, workouts, exerciseLogs })
  output(JSON.stringify(summary))
  return summary
}

function createSupabaseReader(url: string, serviceRoleKey: string): HistoryContinuityReader {
  const supabase = createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  async function selectPage<T>(
    operation: string,
    query: (offset: number, limit: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    offset: number,
    limit: number,
  ): Promise<T[]> {
    const { data, error } = await query(offset, limit)
    if (error) throw new Error(`${operation} could not be read`)
    return data ?? []
  }

  return {
    progressLogs: (offset, limit) => selectPage<HistoryAuditLog>('Progress logs', (start, size) =>
      supabase
        .from('progress_logs')
        .select('id, user_id, workout_id, session_context_snapshot')
        .order('id', { ascending: true })
        .range(start, start + size - 1) as unknown as PromiseLike<{ data: HistoryAuditLog[] | null; error: { message: string } | null }>, offset, limit),
    workouts: (offset, limit) => selectPage<HistoryAuditWorkout>('Workouts', (start, size) =>
      supabase
        .from('workouts')
        .select('id')
        .order('id', { ascending: true })
        .range(start, start + size - 1) as unknown as PromiseLike<{ data: HistoryAuditWorkout[] | null; error: { message: string } | null }>, offset, limit),
    exerciseLogs: (offset, limit) => selectPage<HistoryAuditExerciseLog>('Exercise logs', (start, size) =>
      supabase
        .from('exercise_logs')
        .select('id, progress_log_id')
        .order('progress_log_id', { ascending: true })
        .order('id', { ascending: true })
        .range(start, start + size - 1) as unknown as PromiseLike<{ data: HistoryAuditExerciseLog[] | null; error: { message: string } | null }>, offset, limit),
  }
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase audit credentials')
  await auditHistoryContinuity(createSupabaseReader(url, serviceRoleKey))
}

if (process.argv[1]?.endsWith('audit-plan-history-continuity.ts')) {
  void main().catch(() => {
    console.error('History continuity audit failed.')
    process.exitCode = 1
  })
}
