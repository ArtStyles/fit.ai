const PAGE_SIZE = 300
const LOG_ID_BATCH_SIZE = 100

type QueryError = { message?: string }
type PageResult<T> = { data: T[] | null; error: QueryError | null }

type ProgressHistoryLoaders<TLog extends { id: string }, TExerciseLog> = {
  loadLogPage: (from: number, to: number) => Promise<PageResult<TLog>>
  loadExercisePage: (logIds: string[], from: number, to: number) => Promise<PageResult<TExerciseLog>>
}

async function loadAllPages<T>(
  loadPage: (from: number, to: number) => Promise<PageResult<T>>,
  errorMessage: string,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await loadPage(from, from + PAGE_SIZE - 1)
    if (result.error) throw new Error(result.error.message ?? errorMessage)
    const page = result.data ?? []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

export async function loadCompleteProgressHistory<TLog extends { id: string }, TExerciseLog>({
  loadLogPage,
  loadExercisePage,
}: ProgressHistoryLoaders<TLog, TExerciseLog>): Promise<{ logs: TLog[]; exerciseLogs: TExerciseLog[] }> {
  const logs = await loadAllPages(loadLogPage, 'Could not load progress sessions')
  const exerciseLogs: TExerciseLog[] = []

  for (let start = 0; start < logs.length; start += LOG_ID_BATCH_SIZE) {
    const logIds = logs.slice(start, start + LOG_ID_BATCH_SIZE).map(log => log.id)
    exerciseLogs.push(...await loadAllPages(
      (from, to) => loadExercisePage(logIds, from, to),
      'Could not load exercise progress',
    ))
  }

  return { logs, exerciseLogs }
}
