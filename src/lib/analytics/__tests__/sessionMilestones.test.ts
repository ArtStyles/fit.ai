import { describe, expect, it } from 'vitest'
import { recordSessionCompletionMilestone } from '../sessionMilestones'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => Array.from(values.keys())[index] ?? null,
    removeItem: key => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('session completion milestones', () => {
  it('emits first and second completion once per saved progress log', () => {
    const storage = memoryStorage()

    expect(recordSessionCompletionMilestone('log-1', storage)).toBe('first_session_completed')
    expect(recordSessionCompletionMilestone('log-1', storage)).toBeNull()
    expect(recordSessionCompletionMilestone('log-2', storage)).toBe('second_session_completed')
    expect(recordSessionCompletionMilestone('log-3', storage)).toBeNull()
  })

  it('fails closed when browser storage is unavailable', () => {
    const brokenStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    } as unknown as Storage

    expect(recordSessionCompletionMilestone('log-1', brokenStorage)).toBeNull()
  })
})
