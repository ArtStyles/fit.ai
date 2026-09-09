import { describe, expect, it } from 'vitest'
import { convertLegacySnapshot } from '../legacyRecovery'
import { defaultTrainingProfile } from '../../domain/training'
import type { MobileAccount, MobilePlan } from '../../domain/types'

const owner: MobileAccount = { id: 'a', remoteUserId: 'remote-a', name: 'Ana', profile: defaultTrainingProfile(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
const plans: MobilePlan[] = [{ id: 'p', accountId: 'a', remoteId: 'p', source: 'personal', name: 'Plan', notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), workouts: [{ id: 'w', name: 'Sentadilla', dayOfWeek: 1, exercises: [] }] }]
const snapshot = () => ({ version: 2, userId: 'remote-a', clientSessionId: '11111111-1111-4111-8111-111111111111', workoutId: 'w', workoutName: 'Sesión anterior', startedAt: Date.now() - 60_000, exercises: [{ workoutExerciseId: 'we', exerciseId: 'ex', name: 'Sentadilla', status: 'active', sets: [{ weightKg: '20', reps: '8', rpe: null, completed: true }] }] })

describe('legacy workout recovery', () => {
  it('preserves stable session identity, recorded sets and original timestamp', () => {
    const before = snapshot()
    const recovered = convertLegacySnapshot(before, owner, plans)!
    expect(recovered.id).toBe(before.clientSessionId)
    expect(recovered.accountId).toBe('a')
    expect(recovered.startedAt).toBe(new Date(before.startedAt).toISOString())
    expect(recovered.exercises[0].sets[0]).toMatchObject({ reps: 8, weightKg: 20, completed: true })
  })
  it('refuses another account or a workout absent from its imported plans', () => {
    expect(convertLegacySnapshot({ ...snapshot(), userId: 'remote-b' }, owner, plans)).toBeNull()
    expect(convertLegacySnapshot(snapshot(), owner, [])).toBeNull()
    expect(convertLegacySnapshot(snapshot(), { ...owner, remoteUserId: null }, plans)).toBeNull()
  })
  it('refuses malformed numbers rather than importing corrupt training data', () => {
    const before = snapshot()
    before.exercises[0].sets[0].weightKg = 'NaN'
    expect(convertLegacySnapshot(before, owner, plans)).toBeNull()
  })
  it('retains finished time so a recovered completed session is not reopened', () => {
    const finishedAt = Date.now()
    const recovered = convertLegacySnapshot({ ...snapshot(), finishedAt }, owner, plans)!
    expect(recovered.finishedAt).toBe(new Date(finishedAt).toISOString())
  })
})
