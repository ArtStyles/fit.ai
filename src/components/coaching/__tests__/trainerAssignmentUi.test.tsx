import { describe, expect, it } from 'vitest'

describe('trainer assignment UI contracts', () => {
  it('wires a client-selected relationship to the proposal action without exposing activation controls', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../AssignProgramDialog.tsx', import.meta.url), 'utf8'))
    expect(source).toContain("import('@/app/actions/trainerAssignments')")
    expect(source).toContain('proposeTrainerAssignment')
    expect(source).toContain('name="relationshipId"')
    expect(source).toContain('idempotencyKey')
    expect(source).not.toContain('acceptTrainerAssignment')
  })

  it('renders the proposed prescription as read-only review data', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../ProposedProgramReview.tsx', import.meta.url), 'utf8'))
    expect(source).toContain('prescripción se mantiene bloqueada')
    expect(source).toContain('versionNumber')
    expect(source).not.toContain('<input')
    expect(source).not.toContain('<button')
  })
})
