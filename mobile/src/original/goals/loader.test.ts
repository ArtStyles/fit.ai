import { describe, expect, it } from 'vitest'
import { createGoalsLoader } from './loader'
import type { ExerciseGoalsModel } from './types'
const model = (accountId: string): ExerciseGoalsModel => ({ accountId, language: 'es', today: '2026-09-11', goals: [], catalog: [] })

describe('personal goal account loader', () => {
  it('never publishes an old response after account change or disposal', async () => {
    let identity = { accountId: 'a', sessionVersion: 1 }
    let release!: (value: ExerciseGoalsModel) => void
    const output: ExerciseGoalsModel[] = []
    const loader = createGoalsLoader({ identity: async () => identity, load: () => new Promise(resolve => { release = resolve }), publish: value => output.push(value), fail: () => {} })
    const pending = loader.refresh(); await Promise.resolve(); await Promise.resolve()
    identity = { accountId: 'b', sessionVersion: 2 }; release(model('a')); await pending
    expect(output).toEqual([])
    const second = loader.refresh(); await Promise.resolve(); await Promise.resolve()
    loader.dispose(); release(model('b')); await second
    expect(output).toEqual([])
  })
  it('publishes only the newest refresh and rejects a same-owner logout/login response', async () => {
    let version = 1
    const releases: Array<(value: ExerciseGoalsModel) => void> = []
    const output: ExerciseGoalsModel[] = []
    const loader = createGoalsLoader({ identity: async () => ({ accountId: 'a', sessionVersion: version }), load: () => new Promise(resolve => releases.push(resolve)), publish: value => output.push(value), fail: () => {} })
    const first = loader.refresh(); await Promise.resolve(); await Promise.resolve()
    const second = loader.refresh(); await Promise.resolve(); await Promise.resolve()
    releases[1](model('a')); await second
    releases[0](model('a')); await first
    expect(output).toHaveLength(1)
    const third = loader.refresh(); await Promise.resolve(); await Promise.resolve()
    version++; releases[2](model('a')); await third
    expect(output).toHaveLength(1)
  })
})
