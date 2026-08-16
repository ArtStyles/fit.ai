type PreferenceUpdateResult =
  | { ok: true }
  | { ok: false; error: string }

type SingleFlightResult<T> =
  | { started: true; value: T }
  | { started: false }

export function createSingleFlight() {
  let pending = false

  return {
    get isPending() {
      return pending
    },
    async run<T>(task: () => Promise<T>): Promise<SingleFlightResult<T>> {
      if (pending) return { started: false }
      pending = true
      try {
        return { started: true, value: await task() }
      } finally {
        pending = false
      }
    },
  }
}

export async function persistOptimisticPreference<T>({
  previous,
  next,
  save,
  fallbackError,
  onRollback,
  onSuccess,
}: {
  previous: T
  next: T
  save: (next: T) => Promise<PreferenceUpdateResult>
  fallbackError: string
  onRollback: (previous: T, error: string) => void
  onSuccess: () => void
}): Promise<boolean> {
  try {
    const result = await save(next)
    if (result.ok) {
      onSuccess()
      return true
    }
    onRollback(previous, result.error)
  } catch {
    onRollback(previous, fallbackError)
  }
  return false
}

export async function rescheduleWorkoutReminder({
  schedule,
  onRollback,
}: {
  schedule: () => Promise<boolean>
  onRollback: () => void
}): Promise<boolean> {
  try {
    if (await schedule()) return true
  } catch {
    // The UI restores the persisted preference through the supplied callback.
  }
  onRollback()
  return false
}
