import { describe, expect, it } from 'vitest'
import { getReadinessReviewStatus } from '..'
import type { MovementLimitation } from '..'

const stableCleared: MovementLimitation = {
  region: 'knee',
  side: 'left',
  status: 'stable',
  movementsToAvoid: ['squat'],
  clinicianCleared: true,
}

function assessment(limitations: MovementLimitation[] = []) {
  return {
    warningSymptoms: [],
    knownDisease: false,
    recentSurgery: false,
    medicallyCleared: false,
    limitations,
  }
}

describe('readiness review status', () => {
  it('keeps multiple cleared stable limitations in modified mode', () => {
    expect(getReadinessReviewStatus(assessment([
      stableCleared,
      { ...stableCleared, region: 'shoulder', side: 'right', movementsToAvoid: ['vertical_push'] },
    ]))).toBe('modified')
  })

  it('requires professional clearance for any uncleared limitation', () => {
    expect(getReadinessReviewStatus(assessment([
      stableCleared,
      { ...stableCleared, region: 'back', clinicianCleared: false },
    ]))).toBe('professional_clearance_required')
  })

  it('requires professional clearance for an acute limitation even when marked cleared', () => {
    expect(getReadinessReviewStatus(assessment([
      { ...stableCleared, status: 'acute' },
    ]))).toBe('professional_clearance_required')
  })
})
