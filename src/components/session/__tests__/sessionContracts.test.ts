import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { ExerciseCard } from '@/components/session/ExerciseCard'
import { SessionExerciseHeader } from '@/components/session/SessionExerciseHeader'
import type { ExerciseSession } from '@/store/sessionStore'

const sessionClient = readFileSync(new URL('../../../app/(app)/session/[workoutId]/SessionClient.tsx', import.meta.url), 'utf8')
const sessionPage = readFileSync(new URL('../../../app/(app)/session/[workoutId]/page.tsx', import.meta.url), 'utf8')
const exerciseCard = readFileSync(new URL('../ExerciseCard.tsx', import.meta.url), 'utf8')
const setRow = readFileSync(new URL('../SetRow.tsx', import.meta.url), 'utf8')
const timedSetRow = readFileSync(new URL('../TimedSetRow.tsx', import.meta.url), 'utf8')
const restTimer = readFileSync(new URL('../RestTimer.tsx', import.meta.url), 'utf8')
const completion = readFileSync(new URL('../CompletionScreen.tsx', import.meta.url), 'utf8')
const syncStatus = readFileSync(new URL('../SessionSyncStatus.tsx', import.meta.url), 'utf8')
const sessionHeader = readFileSync(new URL('../SessionHeader.tsx', import.meta.url), 'utf8')
const activeSet = readFileSync(new URL('../ActiveSetFocus.tsx', import.meta.url), 'utf8')
const dock = readFileSync(new URL('../CompleteSetDock.tsx', import.meta.url), 'utf8')
const exerciseHeader = readFileSync(new URL('../SessionExerciseHeader.tsx', import.meta.url), 'utf8')
const compactSet = readFileSync(new URL('../CompactSetSummary.tsx', import.meta.url), 'utf8')
const rpeSelector = readFileSync(new URL('../RPESelector.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../../../store/sessionStore.ts', import.meta.url), 'utf8')
const persistence = readFileSync(new URL('../../../lib/session/persistSession.ts', import.meta.url), 'utf8')

const lockedExercise: ExerciseSession = {
  workoutExerciseId: 'locked-session-exercise',
  exerciseId: '11111111-1111-4111-8111-111111111111',
  originalExerciseId: null,
  originalName: null,
  name: 'Sentadilla controlada',
  imageUrl: null,
  instructions: null,
  muscleGroups: [],
  isCompound: true,
  targetSets: 2,
  targetReps: 8,
  targetDuration: null,
  restSeconds: 60,
  targetRpe: 7,
  suggestedWeight: null,
  weightSuggestionBasis: null,
  notes: null,
  source: 'ad_hoc',
  skipReason: null,
  previousPerformance: null,
  sets: [
    { weightKg: '30', reps: '8', rpe: null, completed: false },
    { weightKg: '30', reps: '8', rpe: null, completed: false },
  ],
  status: 'active',
  expanded: true,
  hasLastSessionData: false,
}

function renderSessionMarkup(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(
    I18nProvider,
    { language: 'es', syncDocumentLanguage: false, children: element },
  ))
}

describe('active session wiring contracts', () => {
  it('keeps sync state ephemeral and advances it after each local backup', () => {
    expect(sessionClient).toContain("useState<SessionSyncState>('syncing')")
    expect(sessionClient).toContain('clientSessionId,')
    expect(sessionClient).toContain("syncEventForStorageResult('write', result)")
    expect(sessionClient).toContain('retryLocalBackup')
    expect(store).not.toMatch(/syncStatus|setSyncStatus|SessionSyncState/)
    expect(persistence).not.toMatch(/syncState|syncStatus/)
  })

  it('wires server save and retry through explicit sync transitions', () => {
    expect(completion).toContain("onSyncEvent('server-save')")
    expect(completion).toContain("syncEventForStorageResult('delete', cleanupResult)")
    expect(completion.match(/onSyncEvent\('server-error', 'server'\)/g)).toHaveLength(2)
    expect(completion).toContain("onSyncEvent('retry')")
    expect(completion).toContain('<SessionSyncStatus')
    expect(completion).toContain('createSessionRequestGate()')
    expect(completion).toContain('clientSessionId,')
    expect(completion).toContain('retryCleanup')
    expect(completion).toContain('if (serverSavedRef.current) return')
    expect(completion).toContain("syncEventForStorageResult('delete', result)")
    expect(completion).toMatch(/syncErrorSource === 'backup-delete' \? retryCleanup/)
    expect(completion).not.toMatch(/onClearBackup\(\)\s*\n\s*setPrs/)
    expect(completion).toContain("const message = t(result.error ?? 'No se pudo guardar la sesión')")
    expect(completion).not.toMatch(/error instanceof Error \? error\.message/)
  })

  it('leaves authoritative completion milestones to the committed database insert', () => {
    expect(completion).toContain('const sessionFinishedAt = finishedAt || Date.now()')
    expect(completion).toContain('finishedAt: sessionFinishedAt')
    expect(completion).not.toMatch(/completionAnalyticsForSavedSession|recordSessionCompletionMilestone|trackEvent/)
  })

  it('renders previous performance immediately before set controls', () => {
    const previous = exerciseHeader.indexOf('<PreviousPerformance')
    const header = exerciseCard.indexOf('<ActiveSetFocus')
    expect(previous).toBeGreaterThan(0)
    expect(header).toBeGreaterThan(0)
  })

  it('preserves previous set indices at the server-to-store boundary', () => {
    expect(sessionPage).toContain('zipPreviousPerformanceRows(')
    expect(sessionPage).not.toMatch(/weights_kg[^\n]+\.filter|reps_completed[^\n]+\.filter/)
  })

  it('keeps the current set visually identified in the active exercise hierarchy', () => {
    expect(exerciseCard).toContain('<ActiveSetFocus')
    expect(activeSet).toContain("role=\"group\"")
    expect(activeSet).toContain("t('Serie actual')")
    expect(setRow).toContain("aria-current={isCurrent ? 'step' : undefined}")
    expect(setRow).toContain('Serie actual')
  })

  it('keeps the one-handed completion action accessible', () => {
    expect(activeSet).toContain("ariaLabel={t('Peso en kilogramos')}")
    expect(activeSet).toContain("ariaLabel={t('Repeticiones')}")
    expect(dock).toContain("t('Completar serie {number}'")
    expect(dock).toContain('min-h-14')
  })

  it('turns the completion dock into the existing rest controls', () => {
    expect(dock).toContain('<RestTimer')
    expect(restTimer).toContain('extendRestTimer')
    expect(restTimer).toContain('clearRestTimer')
  })

  it('keeps previous and next sets compact while completed sets remain editable', () => {
    expect(exerciseCard).toContain('<CompactSetSummary')
    expect(compactSet).toContain("relation: 'previous' | 'next'")
    expect(compactSet).toContain('onEdit')
    expect(exerciseCard).toContain('<Dialog')
  })

  it('uses explicit labels, visible units, numeric input modes, and 44px controls', () => {
    expect(setRow).toContain("inputMode={setInputMode('weight')}")
    expect(setRow).toContain("inputMode={setInputMode('reps')}")
    expect(setRow).toContain("aria-label={t('Peso en kilogramos')}")
    expect(setRow).toContain("aria-label={t('Repeticiones')}")
    expect(setRow).toContain("{t('kg')}</span>")
    expect(setRow).toContain("{t('reps')}</span>")
    expect(setRow.match(/min-h-\[44px\]|h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('preserves rest timer controls, safe-area placement, and reduced motion', () => {
    expect(restTimer).toContain('extendRestTimer')
    expect(restTimer).toContain('clearRestTimer')
    expect(restTimer).toContain('min-h-[44px]')
    expect(restTimer).toContain('motion-reduce:animate-none')
    expect(restTimer).toContain('env(safe-area-inset-bottom)')
  })

  it('keeps error retry at 44px while non-error states remain noninteractive', () => {
    expect(syncStatus).toMatch(/if \(state === 'error'\)[\s\S]+<button[\s\S]+min-h-\[44px\]/)
    expect(syncStatus).toMatch(/const Icon =[\s\S]+return \([\s\S]+<div/)
    expect(syncStatus).not.toMatch(/if \(state === 'error'\)[\s\S]+className,[\s\S]+aria-label/)
    expect(sessionHeader).not.toContain('className="min-h-0 basis-full"')
  })

  it('semantically disables inactive and completed RPE controls before handlers can fire', () => {
    expect(setRow).toContain('disabled={!isActive || completed}')
    expect(timedSetRow).toContain('disabled={!isActive || data.completed}')
    expect(rpeSelector.match(/disabled=\{disabled\}/g)).toHaveLength(2)
    expect(rpeSelector).toMatch(/function decrement\(\) \{[\s\S]+if \(disabled\) return[\s\S]+onChange\(next\)/)
    expect(rpeSelector).toMatch(/function increment\(\) \{[\s\S]+if \(disabled\) return[\s\S]+onChange\(next\)/)
  })

  it('keeps result and skip controls while a trainer prescription removes routine mutations', () => {
    expect(sessionPage).toContain('prescriptionLocked')
    expect(sessionClient).toContain('prescriptionLocked')
    expect(sessionClient).toMatch(/\{!prescriptionLocked && \(\s*<SessionRoutineTools exerciseOptions=\{exerciseOptions\} \/>\s*\)\}/)
    expect(exerciseHeader).toContain('prescriptionLocked')
    expect(exerciseHeader).toContain('{!prescriptionLocked && canReplace && (')
    expect(exerciseHeader).toContain('SKIP_REASONS.map')
    expect(exerciseCard).toContain('updateSetField')
  })

  it('renders locked header and card without add/replace/remove controls while preserving skip and result controls', () => {
    const header = renderSessionMarkup(createElement(SessionExerciseHeader, {
      exercise: lockedExercise,
      exerciseOptions: [],
      prescriptionLocked: true,
    }))
    const card = renderSessionMarkup(createElement(ExerciseCard, {
      exercise: lockedExercise,
      exerciseOptions: [],
      prescriptionLocked: true,
    }))

    expect(header).toContain('Saltar por')
    expect(header).not.toContain('Cambiar ejercicio solo por hoy')
    expect(header).not.toContain('Quitar ejercicio agregado')
    expect(card).toContain('Peso en kilogramos')
    expect(card).toContain('Repeticiones')
    expect(card).not.toContain('Cambiar ejercicio solo por hoy')
    expect(card).not.toContain('Quitar ejercicio agregado')
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
