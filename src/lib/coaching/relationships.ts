export type CoachingRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

export type CoachingRelationshipStatus = 'active' | 'paused_by_platform' | 'ended'

export type CoachingConsentScope = 'training_profile' | 'body_measurements'

export type CoachingRequestActor = 'client' | 'trainer'

export type CoachingRelationshipActor = 'client' | 'trainer' | 'platform'

const requestTransitions: Record<
  CoachingRequestActor,
  Partial<Record<CoachingRequestStatus, readonly CoachingRequestStatus[]>>
> = {
  client: {
    pending: ['cancelled'],
  },
  trainer: {
    pending: ['accepted', 'declined'],
  },
}

const relationshipTransitions: Record<
  CoachingRelationshipActor,
  Partial<Record<CoachingRelationshipStatus, readonly CoachingRelationshipStatus[]>>
> = {
  client: {
    active: ['ended'],
    paused_by_platform: ['active', 'ended'],
  },
  trainer: {
    active: ['ended'],
    paused_by_platform: ['ended'],
  },
  platform: {
    active: ['paused_by_platform'],
    paused_by_platform: ['ended'],
  },
}

export function canTransitionCoachingRequest(
  from: CoachingRequestStatus,
  to: CoachingRequestStatus,
  actor: CoachingRequestActor,
): boolean {
  return requestTransitions[actor][from]?.includes(to) ?? false
}

export function canTransitionRelationship(
  from: CoachingRelationshipStatus,
  to: CoachingRelationshipStatus,
  actor: CoachingRelationshipActor,
): boolean {
  return relationshipTransitions[actor][from]?.includes(to) ?? false
}
