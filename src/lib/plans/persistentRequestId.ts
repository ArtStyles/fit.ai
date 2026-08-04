export interface PersistentRequestId {
  current: () => string
  ambiguous: () => void
  confirmed: () => void
  cancel: () => void
}

export function isConfirmedPlanRpcFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: unknown; message?: unknown }
  const code = typeof record.code === 'string' ? record.code.trim().toUpperCase() : ''
  const message = typeof record.message === 'string' ? record.message : ''

  // SQLSTATE is exactly five alphanumeric characters; PostgREST uses PGRSTxxx.
  // Transport codes such as ECONNRESET/ETIMEDOUT must remain ambiguous.
  return /^[0-9A-Z]{5}$/.test(code)
    || /^PGRST\d{3}$/.test(code)
    || /PLAN_[A-Z_]+/.test(message)
}

export function createPersistentRequestId(
  createId: () => string = () => crypto.randomUUID(),
): PersistentRequestId {
  let requestId: string | null = null

  function rotate(): void {
    requestId = null
  }

  return {
    current() {
      requestId ??= createId()
      return requestId
    },
    ambiguous() {},
    confirmed: rotate,
    cancel: rotate,
  }
}

export async function runPersistentPlanRequest<T>(
  request: PersistentRequestId,
  execute: (requestId: string) => Promise<T>,
): Promise<T> {
  try {
    const result = await execute(request.current())
    request.confirmed()
    return result
  } catch (error) {
    request.ambiguous()
    throw error
  }
}
