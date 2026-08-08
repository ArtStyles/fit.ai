import { describe, expect, it } from 'vitest'
import { deriveTrainerRelationshipIdentity, deriveTrainerRelationshipScope } from '../../../../tests/e2e/helpers/core-product'

describe('trainer relationship E2E identities', () => {
  it('keeps each Playwright project and retry in a distinct dedicated account scope', () => {
    const desktopScope = deriveTrainerRelationshipScope({ projectName: 'desktop-1440', workerIndex: 0, parallelIndex: 0, retry: 0 })
    const mobileScope = deriveTrainerRelationshipScope({ projectName: 'mobile-375', workerIndex: 0, parallelIndex: 0, retry: 0 })
    const retriedScope = deriveTrainerRelationshipScope({ projectName: 'desktop-1440', workerIndex: 0, parallelIndex: 0, retry: 1 })

    expect(desktopScope).not.toBe(mobileScope)
    expect(desktopScope).not.toBe(retriedScope)
    expect(deriveTrainerRelationshipIdentity('shared-run', desktopScope, 'client').email)
      .not.toBe(deriveTrainerRelationshipIdentity('shared-run', mobileScope, 'client').email)
  })

  it('never derives the canonical E2E email and preserves the role in its dedicated address', () => {
    const identity = deriveTrainerRelationshipIdentity('run-123', 'desktop-1440-w0-p0-r0', 'trainer-a')

    expect(identity.email).toMatch(/^e2e-run-123-desktop-1440-w0-[a-f0-9]{8}-trainer-a@example\.test$/)
    expect(identity.email).not.toBe('e2e-run-123@example.test')
  })
})
