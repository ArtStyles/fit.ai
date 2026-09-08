import { describe, expect, it, vi } from 'vitest'
import { adaptCoachRelationshipManagement, getCoachRelationshipManagement } from '../relationshipManagement'

export const relationship = { relationshipId: 'rel-a', clientId: 'client-a', clientName: 'Ada', username: null, avatarUrl: null, serviceName: 'Fuerza', status: 'active', startedAt: '2026-08-01T00:00:00Z', trainingConsentActive: true, trainingAccessAvailable: true }
const payload = () => ({ counts: { pendingRequests: 1, activeRelationships: 1, pausedRelationships: 0 }, relationships: [{ ...relationship }] })
describe('relationship management adapter', () => {
  it('retains only explicit authorized management metadata', () => { expect(adaptCoachRelationshipManagement(payload())).toEqual(payload()) })
  it.each([
    { email: 'secret@example.test' }, { relationshipId: '' }, { clientName: undefined }, { status: 'ended' },
    { trainingConsentActive: false }, { status: 'paused_by_platform' }, { startedAt: 'invalid' }, { trainingAccessAvailable: 1 },
  ])('rejects invalid or contradictory metadata %j', invalid => {
    const input=payload(); Object.assign(input.relationships[0],invalid)
    expect(()=>adaptCoachRelationshipManagement(input)).toThrow('COACH_RELATIONSHIP_MANAGEMENT_UNAVAILABLE')
  })
  it('rejects missing/count-mismatched/duplicate rows instead of false zero success', () => {
    for(const input of [null, {}, {...payload(), counts: {...payload().counts, activeRelationships: 0}}, {...payload(), relationships:[relationship,relationship]}]) {
      expect(()=>adaptCoachRelationshipManagement(input)).toThrow('COACH_RELATIONSHIP_MANAGEMENT_UNAVAILABLE')
    }
  })
  it('does not accept caller-selected trainer identity and normalizes errors', async () => {
    const rpc=vi.fn().mockResolvedValue({data:payload(),error:null})
    expect(await getCoachRelationshipManagement({rpc})).toEqual(payload())
    expect(rpc).toHaveBeenCalledWith('get_coach_relationship_management')
    rpc.mockRejectedValue(new Error('private detail'))
    await expect(getCoachRelationshipManagement({rpc})).rejects.toThrow('COACH_RELATIONSHIP_MANAGEMENT_UNAVAILABLE')
  })
})
