import { describe, expect, it } from 'vitest'
import { clearDeletedAccountBrowserData } from './account-browser-cleanup'
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
describe('deleted account browser data cleanup', () => {
  it('removes only owned session drafts, pointers and reminder metadata', () => {
    const owned = [`fitai_session_v2_${owner}_workout`, `fitai_active_session_v2_${owner}`, `fitai:workout-reminders:${owner}`, `vekira-rest:${owner}:session`]
    const values = new Map([...owned.map(key => [key, 'private'] as [string, string]),
      ['fitai_session_legacy', JSON.stringify({ userId: owner, workoutId: 'legacy' })],
      ['fitai_session_owned', JSON.stringify({ workoutId: 'owned' })],
      ['fitai_active_session', JSON.stringify({ workoutId: 'owned' })],
      [`fitai_session_v2_${other}_workout`, 'preserve'], ['fitai-language', 'en'],
      ['fitai_session_unknown', '{}'], ['fitai_session_contradictory', JSON.stringify({ userId: other, workoutId: 'contradictory' })],
    ])
    const storage = { get length() { return values.size }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => { values.delete(key) } }
    clearDeletedAccountBrowserData(owner, ['owned', 'contradictory'], storage)
    expect([...values.keys()]).toEqual([`fitai_session_v2_${other}_workout`, 'fitai-language', 'fitai_session_unknown', 'fitai_session_contradictory'])
  })
})
