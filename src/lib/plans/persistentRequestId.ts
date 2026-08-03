export interface PersistentRequestId {
  current: () => string
  ambiguous: () => void
  confirmed: () => void
  cancel: () => void
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
