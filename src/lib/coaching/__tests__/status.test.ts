import { describe, expect, it } from 'vitest'
import {
  canTransitionApplication,
  type TrainerApplicationStatus,
} from '@/lib/coaching/status'

type Actor = 'applicant' | 'admin'

const allowedTransitions = [
  ['draft', 'submitted', 'applicant'],
  ['changes_requested', 'submitted', 'applicant'],
  ['draft', 'withdrawn', 'applicant'],
  ['submitted', 'withdrawn', 'applicant'],
  ['under_review', 'withdrawn', 'applicant'],
  ['changes_requested', 'withdrawn', 'applicant'],
  ['interview_required', 'withdrawn', 'applicant'],
  ['submitted', 'under_review', 'admin'],
  ['under_review', 'changes_requested', 'admin'],
  ['under_review', 'interview_required', 'admin'],
  ['under_review', 'approved', 'admin'],
  ['under_review', 'rejected', 'admin'],
  ['interview_required', 'changes_requested', 'admin'],
  ['interview_required', 'approved', 'admin'],
  ['interview_required', 'rejected', 'admin'],
] as const satisfies ReadonlyArray<readonly [TrainerApplicationStatus, TrainerApplicationStatus, Actor]>

describe('trainer application status transitions', () => {
  it.each(allowedTransitions)('allows %s -> %s for %s', (from, to, actor) => {
    expect(canTransitionApplication(from, to, actor)).toBe(true)
  })

  it('keeps applicant and administrator capabilities separate', () => {
    expect(canTransitionApplication('draft', 'submitted', 'admin')).toBe(false)
    expect(canTransitionApplication('submitted', 'under_review', 'applicant')).toBe(false)
    expect(canTransitionApplication('under_review', 'interview_required', 'applicant')).toBe(false)
  })

  it('rejects every actor/from/to combination outside the approved matrix', () => {
    const everyStatus: TrainerApplicationStatus[] = [
      'draft',
      'submitted',
      'under_review',
      'changes_requested',
      'interview_required',
      'approved',
      'rejected',
      'withdrawn',
    ]
    const actors: Actor[] = ['applicant', 'admin']

    for (const actor of actors) {
      for (const from of everyStatus) {
        for (const to of everyStatus) {
          const approved = allowedTransitions.some(transition => (
            transition[0] === from && transition[1] === to && transition[2] === actor
          ))
          expect(canTransitionApplication(from, to, actor)).toBe(approved)
        }
      }
    }
  })

  it.each(['approved', 'rejected', 'withdrawn'] as const)('treats %s as a terminal status', status => {
    const everyStatus: TrainerApplicationStatus[] = [
      'draft',
      'submitted',
      'under_review',
      'changes_requested',
      'interview_required',
      'approved',
      'rejected',
      'withdrawn',
    ]

    for (const target of everyStatus) {
      expect(canTransitionApplication(status, target, 'applicant')).toBe(false)
      expect(canTransitionApplication(status, target, 'admin')).toBe(false)
    }
  })
})
