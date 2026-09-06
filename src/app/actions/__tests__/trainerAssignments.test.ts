import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireActiveTrainerContext, requireAppUserContext, revalidatePath } = vi.hoisted(() => ({
  requireActiveTrainerContext: vi.fn(),
  requireAppUserContext: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext }))
vi.mock('next/cache', () => ({ revalidatePath }))

const ids = {
  relationship: '11111111-1111-4111-8111-111111111111',
  template: '22222222-2222-4222-8222-222222222222',
  assignment: '33333333-3333-4333-8333-333333333333',
  version: '44444444-4444-4444-8444-444444444444',
  plan: '55555555-5555-4555-8555-555555555555',
}

function form(values: Record<string, string>) {
  const result = new FormData()
  Object.entries(values).forEach(([key, value]) => result.set(key, value))
  return result
}

function supabaseFixture(result = { assignment_id: ids.assignment, assignment_version_id: ids.version, workout_plan_id: ids.plan }) {
  const rpc = vi.fn(async () => ({ data: result, error: null }))
  return { rpc }
}

describe('trainer assignment proposal errors', () => {
  it.each([
    [
      'TRAINER_ASSIGNMENT_CONSENT_REQUIRED',
      { message: 'TRAINER_ASSIGNMENT_CONSENT_REQUIRED' },
      'No se puede enviar la rutina porque la autorización de datos de entrenamiento del cliente no está activa. Pídele que revise Acompañamiento.',
    ],
    [
      'COACHING_RELATIONSHIP_NOT_ACTIVE',
      { details: 'COACHING_RELATIONSHIP_NOT_ACTIVE' },
      'El acompañamiento está pausado o finalizado. Revísalo antes de enviar la rutina.',
    ],
    [
      'TRAINER_ASSIGNMENT_ACTIVE_EXISTS',
      { hint: 'TRAINER_ASSIGNMENT_ACTIVE_EXISTS' },
      'Este cliente ya tiene una rutina profesional activa. Gestiona esa rutina en lugar de enviar otra.',
    ],
    [
      'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE',
      'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE',
      'Completa todos los días y añade al menos un ejercicio por día antes de enviar la rutina.',
    ],
    [
      'TRAINER_ASSIGNMENT_TEMPLATE_NOT_AVAILABLE',
      { message: 'Postgres: TRAINER_ASSIGNMENT_TEMPLATE_NOT_AVAILABLE' },
      'Esta rutina ya no está disponible para enviarla.',
    ],
    [
      'TRAINER_ASSIGNMENT_TRAINER_INACTIVE',
      { details: 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE' },
      'Tu perfil de entrenador no está activo.',
    ],
    [
      'TRAINER_ASSIGNMENT_CLIENT_INACTIVE',
      { hint: 'TRAINER_ASSIGNMENT_CLIENT_INACTIVE' },
      'La cuenta del cliente no está activa.',
    ],
  ])('maps %s to an actionable tenant-safe message', async (_token, error, expected) => {
    const { mapTrainerAssignmentProposalError } = await import('@/lib/coaching/trainerAssignmentProposalErrors')

    expect(mapTrainerAssignmentProposalError(error)).toBe(expected)
  })

  it('does not expose unknown database text', async () => {
    const { mapTrainerAssignmentProposalError } = await import('@/lib/coaching/trainerAssignmentProposalErrors')
    const rawDatabaseText = 'private row 8dd20be2 violated internal_policy'

    const message = mapTrainerAssignmentProposalError({
      message: rawDatabaseText,
      details: 'tenant@example.test',
      hint: 'SELECT * FROM private_table',
    })

    expect(message).toBe('No se pudo enviar la rutina. Inténtalo de nuevo.')
    expect(message).not.toContain(rawDatabaseText)
    expect(message).not.toContain('tenant@example.test')
    expect(message).not.toContain('private_table')
  })
})

describe('trainer assignment actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('proposes through the atomic RPC and derives the trainer from the active session', async () => {
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { proposeTrainerAssignment } = await import('../trainerAssignments')

    await expect(proposeTrainerAssignment(form({
      relationshipId: ids.relationship,
      templateId: ids.template,
      changeSummary: 'Rutina inicial',
      idempotencyKey: 'client-generated-key-01',
      trainerUserId: 'attacker',
    }))).resolves.toEqual({ ok: true, assignmentId: ids.assignment, assignmentVersionId: ids.version, workoutPlanId: ids.plan })

    expect(supabase.rpc).toHaveBeenCalledWith('propose_trainer_assignment', {
      p_relationship_id: ids.relationship,
      p_template_id: ids.template,
      p_change_summary: 'Rutina inicial',
      p_idempotency_key: 'client-generated-key-01',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('attacker')
    expect(revalidatePath).toHaveBeenCalledWith('/coaching')
  })

  it('rejects malformed identifiers and does not call the RPC', async () => {
    const supabase = supabaseFixture()
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { proposeTrainerAssignment } = await import('../trainerAssignments')

    await expect(proposeTrainerAssignment(form({ relationshipId: 'not-a-uuid', templateId: ids.template, changeSummary: '', idempotencyKey: 'key' }))).resolves.toMatchObject({
      ok: false,
      fieldErrors: { relationshipId: expect.any(String) },
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('returns a safe error when the atomic proposal is rejected', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { message: 'TRAINER_ASSIGNMENT_CONSENT_REQUIRED' } })) }
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { proposeTrainerAssignment } = await import('../trainerAssignments')

    await expect(proposeTrainerAssignment(form({ relationshipId: ids.relationship, templateId: ids.template, changeSummary: '', idempotencyKey: 'key' }))).resolves.toEqual({
      ok: false,
      error: 'No se puede enviar la rutina porque la autorización de datos de entrenamiento del cliente no está activa. Pídele que revise Acompañamiento.',
    })
  })

  it('uses the generic tenant-safe message when the proposal response is malformed', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: { assignment_id: ids.assignment }, error: null })) }
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { proposeTrainerAssignment } = await import('../trainerAssignments')

    await expect(proposeTrainerAssignment(form({ relationshipId: ids.relationship, templateId: ids.template, changeSummary: '', idempotencyKey: 'key' }))).resolves.toEqual({
      ok: false,
      error: 'No se pudo enviar la rutina. Inténtalo de nuevo.',
    })
  })

  it('accepts only through the atomic RPC derived from the client session', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: { assignment_id: ids.assignment, workout_plan_id: ids.plan }, error: null })) }
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-user-1' }, supabase })
    const { acceptTrainerAssignment } = await import('../trainerAssignments')

    await expect(acceptTrainerAssignment(form({
      assignmentId: ids.assignment,
      idempotencyKey: 'accept-attempt-1',
      clientUserId: 'attacker',
    }))).resolves.toEqual({ ok: true, assignmentId: ids.assignment, workoutPlanId: ids.plan })

    expect(supabase.rpc).toHaveBeenCalledWith('accept_trainer_assignment', {
      p_assignment_id: ids.assignment,
      p_idempotency_key: 'accept-attempt-1',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('attacker')
    expect(revalidatePath).toHaveBeenCalledWith('/plan')
  })

  it('does not call acceptance with malformed input', async () => {
    const supabase = { rpc: vi.fn() }
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-user-1' }, supabase })
    const { acceptTrainerAssignment } = await import('../trainerAssignments')

    await expect(acceptTrainerAssignment(form({ assignmentId: 'nope', idempotencyKey: '' }))).resolves.toMatchObject({
      ok: false,
      fieldErrors: { assignmentId: expect.any(String), idempotencyKey: expect.any(String) },
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('declines through the atomic RPC derived from the client session and trims every payload field', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: { assignment_id: ids.assignment, changed: true }, error: null })) }
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-user-1' }, supabase })
    const { declineTrainerAssignment } = await import('../trainerAssignments')

    await expect(declineTrainerAssignment(form({
      assignmentId: `  ${ids.assignment}  `,
      reason: '  Necesito otra progresion.  ',
      idempotencyKey: '  decline-attempt-1  ',
      clientUserId: 'attacker',
    }))).resolves.toEqual({ ok: true, assignmentId: ids.assignment, changed: true })

    expect(requireActiveTrainerContext).not.toHaveBeenCalled()
    expect(supabase.rpc).toHaveBeenCalledWith('decline_trainer_assignment', {
      p_assignment_id: ids.assignment,
      p_reason: 'Necesito otra progresion.',
      p_idempotency_key: 'decline-attempt-1',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('attacker')
    expect(revalidatePath).toHaveBeenCalledWith('/coaching')
    expect(revalidatePath).toHaveBeenCalledWith('/coach/programs')
  })

  it('sends a blank optional decline reason as null', async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: [{ assignment_id: ids.assignment, changed: false }], error: null })) }
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-user-1' }, supabase })
    const { declineTrainerAssignment } = await import('../trainerAssignments')

    await expect(declineTrainerAssignment(form({
      assignmentId: ids.assignment,
      reason: '   ',
      idempotencyKey: 'decline-retry-1',
    }))).resolves.toEqual({ ok: true, assignmentId: ids.assignment, changed: false })

    expect(supabase.rpc).toHaveBeenCalledWith('decline_trainer_assignment', expect.objectContaining({ p_reason: null }))
  })

  it('rejects malformed decline fields before authentication or RPC dispatch', async () => {
    const { declineTrainerAssignment } = await import('../trainerAssignments')

    await expect(declineTrainerAssignment(form({
      assignmentId: 'not-a-uuid',
      reason: 'r'.repeat(501),
      idempotencyKey: 'k'.repeat(201),
    }))).resolves.toMatchObject({
      ok: false,
      fieldErrors: {
        assignmentId: expect.any(String),
        reason: expect.any(String),
        idempotencyKey: expect.any(String),
      },
    })
    expect(requireAppUserContext).not.toHaveBeenCalled()
  })

  it('returns a safe decline error when the RPC fails or omits a boolean changed flag', async () => {
    const supabase = { rpc: vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'private provider details' } })
      .mockResolvedValueOnce({ data: { assignment_id: ids.assignment, changed: 'true' }, error: null }) }
    requireAppUserContext.mockResolvedValue({ user: { id: 'client-user-1' }, supabase })
    const { declineTrainerAssignment } = await import('../trainerAssignments')
    const payload = form({ assignmentId: ids.assignment, reason: '', idempotencyKey: 'decline-safe-error' })

    await expect(declineTrainerAssignment(payload)).resolves.toEqual({
      ok: false,
      error: 'No se pudo rechazar la rutina. Verifica que la propuesta siga pendiente e inténtalo de nuevo.',
    })
    await expect(declineTrainerAssignment(payload)).resolves.toEqual({
      ok: false,
      error: 'No se pudo rechazar la rutina. Verifica que la propuesta siga pendiente e inténtalo de nuevo.',
    })
  })

  it('publishes a future-only revision through the atomic RPC', async () => {
    const supabase = {
      rpc: vi.fn(async () => ({
        data: { assignment_id: ids.assignment, assignment_version_id: ids.version, workout_plan_id: ids.plan },
        error: null,
      })),
    }
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { publishTrainerAssignmentRevision } = await import('../trainerAssignments')

    await expect(publishTrainerAssignmentRevision(form({
      assignmentId: ids.assignment,
      templateId: ids.template,
      changeSummary: 'Subimos una repetición en sentadilla.',
      idempotencyKey: 'revision-attempt-1',
      clientUserId: 'attacker',
    }))).resolves.toEqual({
      ok: true,
      assignmentId: ids.assignment,
      assignmentVersionId: ids.version,
      workoutPlanId: ids.plan,
    })

    expect(supabase.rpc).toHaveBeenCalledWith('publish_trainer_assignment_revision', {
      p_assignment_id: ids.assignment,
      p_template_id: ids.template,
      p_change_summary: 'Subimos una repetición en sentadilla.',
      p_idempotency_key: 'revision-attempt-1',
    })
    expect(JSON.stringify(supabase.rpc.mock.calls)).not.toContain('attacker')
    expect(revalidatePath).toHaveBeenCalledWith('/plan')
  })

  it('requires a non-blank summary before publishing a revision', async () => {
    const supabase = { rpc: vi.fn() }
    requireActiveTrainerContext.mockResolvedValue({ user: { id: 'trainer-user-1' }, supabase })
    const { publishTrainerAssignmentRevision } = await import('../trainerAssignments')

    await expect(publishTrainerAssignmentRevision(form({
      assignmentId: ids.assignment,
      templateId: ids.template,
      changeSummary: '   ',
      idempotencyKey: 'revision-attempt-2',
    }))).resolves.toMatchObject({
      ok: false,
      fieldErrors: { changeSummary: expect.any(String) },
    })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
