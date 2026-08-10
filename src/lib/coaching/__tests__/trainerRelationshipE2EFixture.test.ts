import { describe, expect, it } from 'vitest'
import {
  deriveTrainerFixtureIdentity,
  deriveTrainerRelationshipIdentity,
  deriveTrainerRelationshipScope,
} from '../../../../tests/e2e/helpers/core-product'

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

  it('derives stable, collision-safe scoped trainer names and slugs', () => {
    const desktop = deriveTrainerFixtureIdentity('run-123', 'desktop-1440-w0-p0-r0', 'a')
    const mobile = deriveTrainerFixtureIdentity('run-123', 'mobile-375-w0-p0-r0', 'a')
    const worker = deriveTrainerFixtureIdentity('run-123', 'desktop-1440-w1-p0-r0', 'a')
    const retry = deriveTrainerFixtureIdentity('run-123', 'desktop-1440-w0-p0-r1', 'a')
    const trainerB = deriveTrainerFixtureIdentity('run-123', 'desktop-1440-w0-p0-r0', 'b')

    expect(desktop).toEqual(deriveTrainerFixtureIdentity('run-123', 'desktop-1440-w0-p0-r0', 'a'))
    expect(desktop.slug).toMatch(/^e2e-run-123-desktop-1440-w0-[a-f0-9]{8}-coach-a$/)
    expect(desktop.slug).toHaveLength(44)
    expect(desktop.professionalName).toMatch(/^E2E Coach A run-123 desktop-1440-w0 [a-f0-9]{8}$/)
    expect(new Set([desktop.slug, mobile.slug, worker.slug, retry.slug, trainerB.slug]).size).toBe(5)
  })
})
