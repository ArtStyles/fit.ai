import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sessionClient = readFileSync(new URL('../../../app/(app)/session/[workoutId]/SessionClient.tsx', import.meta.url), 'utf8')
const exerciseCard = readFileSync(new URL('../ExerciseCard.tsx', import.meta.url), 'utf8')
const setRow = readFileSync(new URL('../SetRow.tsx', import.meta.url), 'utf8')
const restTimer = readFileSync(new URL('../RestTimer.tsx', import.meta.url), 'utf8')
const completion = readFileSync(new URL('../CompletionScreen.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../../../store/sessionStore.ts', import.meta.url), 'utf8')
const persistence = readFileSync(new URL('../../../lib/session/persistSession.ts', import.meta.url), 'utf8')

describe('active session wiring contracts', () => {
  it('keeps sync state ephemeral and advances it after each local backup', () => {
    expect(sessionClient).toContain("useState<SessionSyncState>('saved-local')")
    expect(sessionClient).toMatch(/saveBackup\([\s\S]*nextSessionSyncState\([^,]+, 'local-backup'\)/)
    expect(store).not.toMatch(/syncStatus|setSyncStatus|SessionSyncState/)
    expect(persistence).not.toMatch(/syncState|syncStatus/)
  })

  it('wires server save and retry through explicit sync transitions', () => {
    expect(completion).toContain("onSyncEvent('server-save')")
    expect(completion).toContain("onSyncEvent('server-success')")
    expect(completion.match(/onSyncEvent\('server-error'\)/g)).toHaveLength(2)
    expect(completion).toContain("onSyncEvent('retry')")
    expect(completion).toContain('<SessionSyncStatus')
  })

  it('renders previous performance immediately before set controls', () => {
    const previous = exerciseCard.indexOf('<PreviousPerformance')
    const header = exerciseCard.indexOf('Cabecera de la tabla')
    expect(previous).toBeGreaterThan(0)
    expect(header).toBeGreaterThan(previous)
  })

  it('keeps the current set visually identified in the active exercise hierarchy', () => {
    expect(exerciseCard).toContain('currentSetIndex(sets)')
    expect(exerciseCard).toContain('isCurrent={i === activeSetIndex}')
    expect(setRow).toContain("aria-current={isCurrent ? 'step' : undefined}")
    expect(setRow).toContain('Serie actual')
  })

  it('uses explicit labels, visible units, numeric input modes, and 44px controls', () => {
    expect(setRow).toContain("inputMode={setInputMode('weight')}")
    expect(setRow).toContain("inputMode={setInputMode('reps')}")
    expect(setRow).toContain('aria-label="Peso en kilogramos"')
    expect(setRow).toContain('aria-label="Repeticiones"')
    expect(setRow).toContain('kg</span>')
    expect(setRow).toContain('reps</span>')
    expect(setRow.match(/min-h-\[44px\]|h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('preserves rest timer controls, safe-area placement, and reduced motion', () => {
    expect(restTimer).toContain('extendRestTimer')
    expect(restTimer).toContain('clearRestTimer')
    expect(restTimer).toContain('min-h-[44px]')
    expect(restTimer).toContain('motion-reduce:animate-none')
    expect(restTimer).toContain('env(safe-area-inset-bottom)')
  })

  it('orders completion sections and keeps navigation independent of motion', () => {
    const ordered = [
      'data-section="session-complete"',
      'data-section="records"',
      'data-section="weekly-continuity"',
      'data-section="progression-suggestions"',
      'data-section="share"',
      'data-section="dashboard"',
    ].map(marker => completion.indexOf(marker))
    expect(ordered.every(position => position >= 0)).toBe(true)
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b))
    expect(completion).toContain('useReducedMotion()')
    expect(completion).toContain("router.replace('/dashboard')")
    expect(completion).not.toMatch(/await\s+.*router\.replace/)
  })
})
