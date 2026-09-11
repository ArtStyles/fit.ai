import type { ExerciseGoalsModel } from './types'
type Identity = { accountId: string; sessionVersion: number } | null

export function createGoalsLoader(dependencies: {
  identity(): Promise<Identity>
  load(): Promise<ExerciseGoalsModel>
  publish(model: ExerciseGoalsModel): void
  fail(): void
}) {
  let generation = 0, disposed = false
  return {
    async refresh() {
      const request = ++generation
      try {
        const before = await dependencies.identity()
        if (!before || disposed || request !== generation) return
        const model = await dependencies.load()
        const after = await dependencies.identity()
        if (disposed || request !== generation || !after || before.accountId !== after.accountId || before.sessionVersion !== after.sessionVersion || model.accountId !== after.accountId) return
        dependencies.publish(model)
      } catch { if (!disposed && request === generation) dependencies.fail() }
    },
    dispose() { disposed = true; generation++ },
  }
}
