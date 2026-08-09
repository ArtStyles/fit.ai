import { describe, expect, it } from 'vitest'

import { getPlanCapabilities } from '../editability'

describe('getPlanCapabilities', () => {
  it('turns every prescription mutation off for a trainer-assigned plan', () => {
    expect(getPlanCapabilities({ prescriptionLocked: true })).toEqual({
      canEdit: false,
      canAdjustWithAi: false,
      canRegenerate: false,
      canRetire: false,
      canShare: false,
      canActivate: false,
    })
  })

  it('keeps all personal-plan capabilities available', () => {
    expect(getPlanCapabilities({ prescriptionLocked: false })).toEqual({
      canEdit: true,
      canAdjustWithAi: true,
      canRegenerate: true,
      canRetire: true,
      canShare: true,
      canActivate: true,
    })
  })
})
