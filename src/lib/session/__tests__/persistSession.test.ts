import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_SESSION_SETS } from '../limits'
import { clearActiveSession, clearBackup, loadActiveSession, loadBackup, recoverSessionBackup, saveBackup, type SessionSnapshot } from '../persistSession'

const USER_A = 'user-a'; const USER_B = 'user-b'; const WORKOUT = 'workout-1'
const scopedKey = (userId: string) => `fitai_session_v2_${encodeURIComponent(userId)}_${encodeURIComponent(WORKOUT)}`
const pointerKey = (userId: string) => `fitai_active_session_v2_${encodeURIComponent(userId)}`
const snapshot = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  userId: USER_A, clientSessionId: '11111111-1111-4111-8111-111111111111', workoutId: WORKOUT,
  workoutName: 'Workout', startedAt: Date.now() - 60_000, exercises: [], ...overrides,
})
const legacyExercise = { workoutExerciseId: 'we-1', exerciseId: 'ex-1', name: 'Squat', status: 'active', sets: [{ weightKg: '10', reps: '8', rpe: null, completed: false }] }

class MemoryStorage implements Storage {
  values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}
let storage: MemoryStorage
beforeEach(() => { storage = new MemoryStorage(); vi.stubGlobal('localStorage', storage) })

describe('owner-scoped session persistence', () => {
  it('isolates A -> B -> A saves and active pointers', () => {
    saveBackup(snapshot({ workoutName: 'A' })); saveBackup(snapshot({ userId: USER_B, workoutName: 'B' }))
    expect(loadActiveSession(USER_A)?.workoutName).toBe('A')
    expect(loadActiveSession(USER_B)?.workoutName).toBe('B')
    expect(loadBackup(USER_A, WORKOUT)?.userId).toBe(USER_A)
  })

  it('rejects blank owners and a stored owner differing from the key owner', () => {
    expect(saveBackup(snapshot({ userId: ' ' })).ok).toBe(false)
    storage.setItem(scopedKey(USER_A), JSON.stringify({ version: 2, ...snapshot({ userId: USER_B }) }))
    expect(loadBackup(USER_A, WORKOUT)).toBeNull()
    expect(storage.getItem(scopedKey(USER_A))).not.toBeNull()
  })

  it('roundtrips exact client and finish timestamps', () => {
    const value = snapshot({ finishedAt: Date.now() - 1_000 }); saveBackup(value)
    expect(loadBackup(USER_A, WORKOUT)).toMatchObject({ userId: USER_A, clientSessionId: value.clientSessionId, finishedAt: value.finishedAt })
  })

  it.each([undefined, 0])('restores %s finishedAt as ongoing', finishedAt => {
    saveBackup(snapshot({ finishedAt })); expect(loadBackup(USER_A, WORKOUT)?.finishedAt ?? 0).toBe(0)
  })

  it.each([Date.now() - 120_000, Date.now() + 6 * 60_000])('rejects invalid finish timestamp %s', finishedAt => {
    storage.setItem(scopedKey(USER_A), JSON.stringify({ version: 2, ...snapshot({ finishedAt }) }))
    expect(loadBackup(USER_A, WORKOUT)).toBeNull()
  })

  it('retains a valid finished pending draft after the crash-recovery age window', () => {
    const startedAt = Date.now() - 13 * 60 * 60_000
    const finishedAt = startedAt + 45 * 60_000
    storage.setItem(scopedKey(USER_A), JSON.stringify({ version: 2, ...snapshot({ startedAt, finishedAt }) }))
    expect(loadBackup(USER_A, WORKOUT)?.finishedAt).toBe(finishedAt)
  })

  it('clears only the requested owner data', () => {
    saveBackup(snapshot()); saveBackup(snapshot({ userId: USER_B }))
    expect(clearBackup(USER_A, WORKOUT)).toEqual({ ok: true }); expect(loadActiveSession(USER_A)).toBeNull(); expect(loadActiveSession(USER_B)).not.toBeNull()
    expect(clearActiveSession(USER_B)).toEqual({ ok: true }); expect(loadBackup(USER_B, WORKOUT)).toBeNull()
  })

  it('reports storage write failures', () => {
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => { throw new Error('quota exceeded') })
    expect(saveBackup(snapshot())).toEqual({ ok: false, error: 'quota exceeded' })
  })
})

describe('legacy migration', () => {
  function storeLegacy(overrides: Record<string, unknown> = {}) {
    const legacy = { workoutId: WORKOUT, workoutName: 'Legacy', startedAt: Date.now() - 60_000, exercises: [legacyExercise], ...overrides }
    storage.setItem(`fitai_session_${WORKOUT}`, JSON.stringify(legacy)); storage.setItem('fitai_active_session', JSON.stringify({ workoutId: WORKOUT }))
    return legacy
  }

  it('keeps anonymous legacy invisible until ownership is verified', async () => {
    storeLegacy(); expect(loadBackup(USER_A, WORKOUT)).toBeNull(); expect(loadActiveSession(USER_A)).toBeNull()
    const restored = await recoverSessionBackup(USER_A, WORKOUT, async () => USER_A)
    expect(restored).toMatchObject({ userId: USER_A, workoutName: 'Legacy' }); expect(storage.getItem(`fitai_session_${WORKOUT}`)).toBeNull()
  })

  it('uses the old active pointer when no workout id is supplied', async () => {
    storeLegacy(); expect((await recoverSessionBackup(USER_A, null, async () => USER_A))?.workoutId).toBe(WORKOUT)
  })

  it('preserves legacy bytes when verification returns a different owner', async () => {
    const raw = JSON.stringify(storeLegacy()); expect(await recoverSessionBackup(USER_A, WORKOUT, async () => USER_B)).toBeNull()
    expect(storage.getItem(`fitai_session_${WORKOUT}`)).toBe(raw); expect(storage.getItem('fitai_active_session')).not.toBeNull()
  })

  it.each([
    ['null ownership', async () => null],
    ['network exception', async () => { throw new Error('network') }],
  ])('blocks initialization on %s and retries without losing the legacy id or sets', async (_name, verifyOwner) => {
    const clientSessionId = '22222222-2222-4222-8222-222222222222'
    const raw = JSON.stringify(storeLegacy({ clientSessionId }))

    await expect(recoverSessionBackup(USER_A, WORKOUT, verifyOwner)).rejects.toThrow('ownership')
    expect(storage.getItem(`fitai_session_${WORKOUT}`)).toBe(raw)

    const restored = await recoverSessionBackup(USER_A, WORKOUT, async () => USER_A)
    expect(restored?.clientSessionId).toBe(clientSessionId)
    expect(restored?.exercises[0].sets).toEqual(legacyExercise.sets)
  })

  it('throws and preserves legacy evidence when scoped copy fails', async () => {
    const raw = JSON.stringify(storeLegacy())
    vi.spyOn(storage, 'setItem').mockImplementationOnce((key, value) => { if (key === scopedKey(USER_A)) throw new Error('quota exceeded'); storage.values.set(key, value) })
    await expect(recoverSessionBackup(USER_A, WORKOUT, async () => USER_A)).rejects.toThrow('quota exceeded')
    expect(storage.getItem(`fitai_session_${WORKOUT}`)).toBe(raw)
  })

  it('prefers a concurrent scoped save and leaves legacy intact', async () => {
    storeLegacy(); let resolveOwner!: (owner: string) => void
    const recovery = recoverSessionBackup(USER_A, WORKOUT, () => new Promise(resolve => { resolveOwner = resolve }))
    saveBackup(snapshot({ workoutName: 'Newer' })); resolveOwner(USER_A)
    expect((await recovery)?.workoutName).toBe('Newer'); expect(storage.getItem(`fitai_session_${WORKOUT}`)).not.toBeNull()
  })

  it('preserves a different active workout saved while dock ownership verification is pending', async () => {
    storeLegacy()
    let resolveOwner!: (owner: string) => void
    const recovery = recoverSessionBackup(USER_A, null, () => new Promise(resolve => { resolveOwner = resolve }))
    saveBackup(snapshot({ workoutId: 'workout-2', workoutName: 'New active workout' }))
    resolveOwner(USER_A)

    expect((await recovery)?.workoutId).toBe('workout-2')
    expect(loadActiveSession(USER_A)?.workoutId).toBe('workout-2')
    expect(JSON.parse(storage.getItem(pointerKey(USER_A))!)).toMatchObject({ workoutId: 'workout-2' })
  })

  it('normalizes bounded legacy data only after verification', async () => {
    storeLegacy({ exercises: [{ ...legacyExercise, sets: Array.from({ length: MAX_SESSION_SETS }, () => ({ ...legacyExercise.sets[0] })) }] })
    expect((await recoverSessionBackup(USER_A, WORKOUT, async () => USER_A))?.exercises[0]).toMatchObject({ targetSets: MAX_SESSION_SETS, muscleGroups: [], restSeconds: 60, targetRpe: 7, source: 'planned' })
  })

  it.each([
    { exercises: 'bad' }, { exercises: [{ ...legacyExercise, sets: 'bad' }] }, { exercises: [{ ...legacyExercise, targetRpe: 11 }] },
    { exercises: [{ ...legacyExercise, sets: [{ ...legacyExercise.sets[0], reps: '101' }] }] },
    { exercises: [{ ...legacyExercise, previousPerformance: [{ weightKg: -1, reps: 8 }] }] },
    { exercises: [{ ...legacyExercise, sets: Array.from({ length: MAX_SESSION_SETS + 1 }, () => legacyExercise.sets[0]) }] },
  ])('rejects corrupt or unbounded legacy content %#', async corrupt => {
    storeLegacy(corrupt); expect(await recoverSessionBackup(USER_A, WORKOUT, async () => USER_A)).toBeNull(); expect(storage.getItem(`fitai_session_${WORKOUT}`)).not.toBeNull()
  })


  it.each([
    ['originalExerciseId', 42], ['originalName', []], ['imageUrl', 42], ['instructions', []],
    ['muscleGroups', 'legs'], ['isCompound', 'false'], ['targetSets', '3'], ['targetReps', '8'],
    ['targetDuration', '30'], ['restSeconds', '60'], ['targetRpe', '7'], ['suggestedWeight', '10'],
    ['weightSuggestionBasis', 'guessed'], ['notes', 42], ['source', 'imported'], ['skipReason', 42],
    ['expanded', 'yes'], ['hasLastSessionData', 'no'], ['previousPerformance', 'bad'],
  ])('rejects corrupt optional legacy exercise field %s', async (field, value) => {
    storeLegacy({ exercises: [{ ...legacyExercise, [field]: value }] })
    expect(await recoverSessionBackup(USER_A, WORKOUT, async () => USER_A)).toBeNull()
  })

  it.each([
    ['targetSets', -1], ['targetSets', 101], ['targetReps', -1], ['targetReps', 101],
    ['targetDuration', -1], ['targetDuration', 43_201], ['restSeconds', -1], ['restSeconds', 3_601],
    ['targetRpe', 0], ['targetRpe', 11], ['targetRpe', 7.5], ['suggestedWeight', -1], ['suggestedWeight', 501],
  ])('rejects out-of-domain legacy exercise field %s=%s', async (field, value) => {
    storeLegacy({ exercises: [{ ...legacyExercise, [field]: value }] })
    expect(await recoverSessionBackup(USER_A, WORKOUT, async () => USER_A)).toBeNull()
  })

  it.each([
    ['weightKg', '-1'], ['weightKg', '501'], ['weightKg', ' '], ['reps', '-1'], ['reps', '101'],
    ['rpe', 0], ['rpe', 11], ['rpe', 7.5], ['durationSeconds', -1], ['durationSeconds', 43_201], ['durationSeconds', 30.5],
  ])('rejects out-of-domain legacy set field %s=%s', async (field, value) => {
    storeLegacy({ exercises: [{ ...legacyExercise, sets: [{ ...legacyExercise.sets[0], [field]: value }] }] })
    expect(await recoverSessionBackup(USER_A, WORKOUT, async () => USER_A)).toBeNull()
  })
})

describe('storage race safety', () => {
  it('does not promote a stale legacy snapshot changed during ownership verification', async () => {
    const oldRaw = JSON.stringify({ workoutId: WORKOUT, workoutName: 'Old', startedAt: Date.now() - 60_000, exercises: [] })
    storage.setItem(`fitai_session_${WORKOUT}`, oldRaw); storage.setItem('fitai_active_session', JSON.stringify({ workoutId: WORKOUT }))
    let resolveOwner!: (owner: string) => void
    const recovery = recoverSessionBackup(USER_A, WORKOUT, () => new Promise(resolve => { resolveOwner = resolve }))
    storage.setItem(`fitai_session_${WORKOUT}`, JSON.stringify({ ...JSON.parse(oldRaw), workoutName: 'Changed' }))
    resolveOwner(USER_A)
    await expect(recovery).rejects.toThrow('changed')
    expect(loadBackup(USER_A, WORKOUT)).toBeNull()
    expect(storage.getItem(`fitai_session_${WORKOUT}`)).toContain('Changed')
  })

  it('stores v2 owner records and pointers', () => {
    saveBackup(snapshot())
    expect(JSON.parse(storage.getItem(scopedKey(USER_A))!)).toMatchObject({ version: 2, userId: USER_A })
    expect(JSON.parse(storage.getItem(pointerKey(USER_A))!)).toEqual({ version: 2, userId: USER_A, workoutId: WORKOUT })
  })
})
