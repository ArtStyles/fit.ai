import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { requireAdminUserContext } from '@/lib/auth/admin'

vi.mock('@/lib/auth/admin', () => ({ requireAdminUserContext: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  approveTrainerApplication,
  recordTrainerInterviewOutcome,
  rejectTrainerApplication,
  requestTrainerChanges,
  scheduleTrainerInterview,
  startTrainerReview,
} from '../adminTrainers'

const requireAdminUserContextMock = requireAdminUserContext as unknown as Mock
const APPLICATION_ID = '11111111-1111-4111-8111-111111111111'
const INTERVIEW_ID = '22222222-2222-4222-8222-222222222222'
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}

function serviceFor(status: string, rpcData: Record<string, unknown> = {}) {
  const rpc = vi.fn().mockResolvedValue({
    data: {
      application_id: APPLICATION_ID,
      status,
      transitioned: true,
      event_id: '33333333-3333-4333-8333-333333333333',
      ...rpcData,
    },
    error: null,
  })
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: APPLICATION_ID, status }, error: null }),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return { service: { from: vi.fn().mockReturnValue(query), rpc }, rpc }
}

function validApplicationForm(extra: Record<string, string> = {}): FormData {
  return form({ applicationId: APPLICATION_ID, ...extra })
}

describe('trainer administrative actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires the authenticated administrator context before mutating', async () => {
    requireAdminUserContextMock.mockRejectedValue(new Error('admin required'))

    await expect(startTrainerReview(validApplicationForm())).rejects.toThrow('admin required')
  })

  it('rejects malformed application UUIDs without calling the RPC', async () => {
    const { service, rpc } = serviceFor('submitted')
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    await expect(startTrainerReview(form({ applicationId: 'not-a-uuid' }))).resolves.toEqual({
      ok: false,
      error: 'Solicitud no valida.',
    })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['requestTrainerChanges', requestTrainerChanges],
    ['rejectTrainerApplication', rejectTrainerApplication],
  ])('requires a public note for %s', async (_name, action) => {
    const { service, rpc } = serviceFor('under_review')
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    await expect(action(validApplicationForm({ internalNote: 'Solo para administracion.' })))
      .resolves.toMatchObject({ ok: false, fieldErrors: { publicNote: expect.any(String) } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects interview dates that are not in the future', async () => {
    const { service, rpc } = serviceFor('under_review')
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    const result = await scheduleTrainerInterview(validApplicationForm({
      interviewId: INTERVIEW_ID,
      proposedAt: '2020-01-01T10:00',
      timezone: 'America/Havana',
      medium: 'video_call',
    }))

    expect(result).toMatchObject({ ok: false, fieldErrors: { proposedAt: expect.any(String) } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['2027-03-14T02:30', 'America/New_York', 'nonexistent DST wall clock'],
    ['2026-11-01T01:30', 'America/New_York', 'ambiguous DST wall clock'],
  ])('rejects %s in %s as a %s', async (proposedAt, timezone) => {
    const { service, rpc } = serviceFor('under_review')
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    const result = await scheduleTrainerInterview(validApplicationForm({
      interviewId: INTERVIEW_ID,
      proposedAt,
      timezone,
      medium: 'video_call',
    }))

    expect(result).toMatchObject({ ok: false, fieldErrors: { proposedAt: expect.any(String) } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects an invalid IANA timezone before calling the RPC', async () => {
    const { service, rpc } = serviceFor('under_review')
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    const result = await scheduleTrainerInterview(validApplicationForm({
      interviewId: INTERVIEW_ID,
      proposedAt: '2099-01-01T10:00',
      timezone: 'Mars/Olympus_Mons',
      medium: 'video_call',
    }))

    expect(result).toMatchObject({ ok: false, fieldErrors: { timezone: expect.any(String) } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each(['http://meet.example.test/room', 'javascript:alert(1)', 'nota-en-lugar-de-url'])('rejects unsafe interview URL %s', async externalUrl => {
    const { service, rpc } = serviceFor('under_review')
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    const result = await scheduleTrainerInterview(validApplicationForm({
      interviewId: INTERVIEW_ID,
      proposedAt: '2099-01-01T10:00',
      timezone: 'Asia/Tokyo',
      medium: 'video_call',
      externalUrl,
    }))

    expect(result).toMatchObject({ ok: false, fieldErrors: { externalUrl: expect.any(String) } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('resolves the submitted IANA zone instead of the server zone and passes UTC plus the original zone', async () => {
    const { service, rpc } = serviceFor('interview_required', { interview_id: INTERVIEW_ID })
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })
    vi.stubEnv('TZ', 'America/Los_Angeles')

    const result = await scheduleTrainerInterview(validApplicationForm({
      interviewId: INTERVIEW_ID,
      proposedAt: '2099-01-01T10:00',
      timezone: 'Asia/Tokyo',
      medium: 'video_call',
      externalUrl: 'https://meet.example.test/room',
      publicNote: 'Usaremos el enlace externo indicado.',
      internalNote: 'Confirmar cinco minutos antes.',
      actorUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }))
    vi.unstubAllEnvs()

    expect(result).toMatchObject({ ok: true, interviewId: INTERVIEW_ID })
    expect(rpc).toHaveBeenCalledWith('transition_trainer_application', {
      p_action: 'schedule_interview',
      p_actor_user_id: ADMIN_ID,
      p_application_id: APPLICATION_ID,
      p_payload: {
        external_url: 'https://meet.example.test/room',
        internal_note: 'Confirmar cinco minutos antes.',
        interview_id: INTERVIEW_ID,
        medium: 'video_call',
        proposed_at: '2099-01-01T01:00:00.000Z',
        public_note: 'Usaremos el enlace externo indicado.',
        timezone: 'Asia/Tokyo',
      },
    })
  })

  it('records only supported interview outcomes', async () => {
    const { service, rpc } = serviceFor('interview_required', { interview_id: INTERVIEW_ID })
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    const invalid = await recordTrainerInterviewOutcome(validApplicationForm({
      interviewId: INTERVIEW_ID,
      interviewStatus: 'scheduled',
      outcome: 'Pendiente.',
    }))
    expect(invalid).toMatchObject({ ok: false, fieldErrors: { interviewStatus: expect.any(String) } })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('approves through the RPC and accepts its idempotent retry result', async () => {
    const { service, rpc } = serviceFor('approved')
    rpc.mockResolvedValueOnce({
      data: {
        application_id: APPLICATION_ID,
        status: 'approved',
        transitioned: false,
        event_id: '33333333-3333-4333-8333-333333333333',
        profile_id: '44444444-4444-4444-8444-444444444444',
      },
      error: null,
    })
    requireAdminUserContextMock.mockResolvedValue({ user: { id: ADMIN_ID }, service })

    await expect(approveTrainerApplication(validApplicationForm({
      publicNote: 'Solicitud aprobada.',
      actorUserId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }))).resolves.toEqual({
      ok: true,
      applicationId: APPLICATION_ID,
      status: 'approved',
      transitioned: false,
    })
    expect(rpc).toHaveBeenCalledWith('transition_trainer_application', expect.objectContaining({
      p_actor_user_id: ADMIN_ID,
      p_action: 'approve',
    }))
  })
})
