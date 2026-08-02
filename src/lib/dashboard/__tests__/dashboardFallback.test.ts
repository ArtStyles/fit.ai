import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../../../app/(app)/dashboard/page.tsx', import.meta.url), 'utf8')

describe('dashboard fallback history query', () => {
  it('loads the live workout relation needed to resolve legacy sessions without snapshots', () => {
    expect(page).toContain(".select('id, workout_id, completed_at, duration_minutes, session_context_snapshot, workout:workouts(name, focus)')")
  })

  it('orders fallback logs by completion and a stable id tie-break', () => {
    expect(page).toContain(".order('completed_at', { ascending: false })")
    expect(page).toContain(".order('id', { ascending: false })")
  })
})
