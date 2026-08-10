import { describe, expect, it } from 'vitest'
import {
  canTransitionCoachingRequest,
  canTransitionRelationship,
  type CoachingRelationshipStatus,
  type CoachingRequestStatus,
} from '@/lib/coaching/relationships'

describe('coaching request transitions', () => {
  it('lets the assigned trainer accept a pending request', () => {
    expect(canTransitionCoachingRequest('pending', 'accepted', 'trainer')).toBe(true)
  })

  it('lets the client cancel only a pending request', () => {
    expect(canTransitionCoachingRequest('pending', 'cancelled', 'client')).toBe(true)
    expect(canTransitionCoachingRequest('accepted', 'cancelled', 'client')).toBe(false)
  })

  it('denies transitions outside the request ownership matrix', () => {
    const statuses: CoachingRequestStatus[] = ['pending', 'accepted', 'declined', 'cancelled']

    for (const from of statuses) {
      for (const to of statuses) {
        expect(canTransitionCoachingRequest(from, to, 'trainer')).toBe(
          from === 'pending' && (to === 'accepted' || to === 'declined'),
        )
        expect(canTransitionCoachingRequest(from, to, 'client')).toBe(
          from === 'pending' && to === 'cancelled',
        )
      }
    }
  })
})

describe('coaching relationship transitions', () => {
  it('lets a paused client resume after a platform pause', () => {
    expect(canTransitionRelationship('paused_by_platform', 'active', 'client')).toBe(true)
  })

  it('keeps ended relationships terminal', () => {
    expect(canTransitionRelationship('ended', 'active', 'client')).toBe(false)
  })

  it('allows participants to end active relationships without letting them pause accounts', () => {
    expect(canTransitionRelationship('active', 'ended', 'client')).toBe(true)
    expect(canTransitionRelationship('active', 'ended', 'trainer')).toBe(true)
    expect(canTransitionRelationship('active', 'paused_by_platform', 'client')).toBe(false)
    expect(canTransitionRelationship('active', 'paused_by_platform', 'trainer')).toBe(false)
  })

  it('denies every transition out of ended regardless of actor', () => {
    const statuses: CoachingRelationshipStatus[] = ['active', 'paused_by_platform', 'ended']
    for (const target of statuses) {
      expect(canTransitionRelationship('ended', target, 'client')).toBe(false)
      expect(canTransitionRelationship('ended', target, 'trainer')).toBe(false)
      expect(canTransitionRelationship('ended', target, 'platform')).toBe(false)
    }
  })
})
