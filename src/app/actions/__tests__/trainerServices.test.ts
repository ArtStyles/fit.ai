import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireActiveTrainerContext, revalidatePath } = vi.hoisted(() => ({
  requireActiveTrainerContext: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/coaching/access', () => ({ requireActiveTrainerContext }))
vi.mock('next/cache', () => ({ revalidatePath }))

function validServiceForm(): FormData {
  const formData = new FormData()
  formData.set('name', 'Acompañamiento de fuerza')
  formData.set('description', 'Sesiones semanales enfocadas en progreso sostenible.')
  formData.set('modality', 'online')
  formData.set('durationMinutes', '60')
  formData.set('content', 'Evaluación inicial, rutina y seguimiento.')
  formData.set('capacity', '12')
  return formData
}

function servicesSupabase(options: {
  existing?: { id: string } | null
  insert?: ReturnType<typeof vi.fn>
  update?: ReturnType<typeof vi.fn>
}) {
  const insert = options.insert ?? vi.fn(() => ({
    select: () => ({ single: async () => ({ data: { id: 'service-1' }, error: null }) }),
  }))
  const update = options.update ?? vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        select: () => ({ single: async () => ({ data: { id: 'service-1' }, error: null }) }),
      }),
    }),
  }))
  const existing = options.existing === undefined ? { id: 'service-1' } : options.existing
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
    insert,
    update,
  }
  return { from: vi.fn(() => chain), insert, update, chain }
}

describe('trainer service actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an offering using only columns granted to the authenticated trainer', async () => {
    const supabase = servicesSupabase({})
    requireActiveTrainerContext.mockResolvedValue({
      user: { id: 'trainer-user-1' },
      trainerProfile: { id: 'trainer-profile-1', status: 'active' },
      supabase,
    })
    const formData = validServiceForm()
    formData.set('trainerProfileId', 'attacker-profile')
    formData.set('trainerUserId', 'attacker-user')
    const { createTrainerService } = await import('../trainerServices')

    await expect(createTrainerService(formData)).resolves.toEqual({ ok: true, serviceId: 'service-1' })
    expect(requireActiveTrainerContext).toHaveBeenCalledTimes(1)
    expect(supabase.insert).toHaveBeenCalledWith({
      trainer_profile_id: 'trainer-profile-1',
      name: 'Acompañamiento de fuerza',
      description: 'Sesiones semanales enfocadas en progreso sostenible.',
      modality: 'online',
      duration_minutes: 60,
      content: 'Evaluación inicial, rutina y seguimiento.',
      capacity: 12,
    })
    expect(JSON.stringify(supabase.insert.mock.calls)).not.toContain('attacker')
  })

  it('rejects a client-injected price before writing a service', async () => {
    const supabase = servicesSupabase({})
    requireActiveTrainerContext.mockResolvedValue({ trainerProfile: { id: 'trainer-profile-1' }, supabase })
    const formData = validServiceForm()
    formData.set('price_minor', '1000')
    const { createTrainerService } = await import('../trainerServices')

    await expect(createTrainerService(formData)).resolves.toEqual({
      ok: false,
      error: 'Revisa los campos del servicio.',
      fieldErrors: { commercial: 'Los servicios no admiten precios ni facturación.' },
    })
    expect(supabase.insert).not.toHaveBeenCalled()
  })

  it('runs the active trainer guard before validation or queries on update', async () => {
    const formData = validServiceForm()
    formData.set('serviceId', 'service-1')
    formData.set('price_minor', '1000')
    requireActiveTrainerContext.mockRejectedValue(new Error('ACTIVE_TRAINER_REQUIRED'))
    const { updateTrainerService } = await import('../trainerServices')

    await expect(updateTrainerService(formData)).rejects.toThrow('ACTIVE_TRAINER_REQUIRED')
    expect(requireActiveTrainerContext).toHaveBeenCalledTimes(1)
  })

  it('updates only granted columns on an offering owned by the active trainer', async () => {
    const supabase = servicesSupabase({ existing: { id: 'service-1' } })
    requireActiveTrainerContext.mockResolvedValue({ trainerProfile: { id: 'trainer-profile-1' }, supabase })
    const formData = validServiceForm()
    formData.set('serviceId', 'service-1')
    formData.set('id', 'attacker-service')
    const { updateTrainerService } = await import('../trainerServices')

    await expect(updateTrainerService(formData)).resolves.toEqual({ ok: true, serviceId: 'service-1' })
    expect(supabase.chain.eq).toHaveBeenCalledWith('id', 'service-1')
    expect(supabase.chain.eq).toHaveBeenCalledWith('trainer_profile_id', 'trainer-profile-1')
    expect(supabase.update).toHaveBeenCalledWith({
      name: 'Acompañamiento de fuerza',
      description: 'Sesiones semanales enfocadas en progreso sostenible.',
      modality: 'online',
      duration_minutes: 60,
      content: 'Evaluación inicial, rutina y seguimiento.',
      capacity: 12,
    })
    expect(JSON.stringify(supabase.update.mock.calls)).not.toContain('attacker-service')
  })

  it('does not update a service outside the active trainer ownership boundary', async () => {
    const supabase = servicesSupabase({ existing: null })
    requireActiveTrainerContext.mockResolvedValue({ trainerProfile: { id: 'trainer-profile-1' }, supabase })
    const formData = validServiceForm()
    formData.set('serviceId', 'other-service')
    const { updateTrainerService } = await import('../trainerServices')

    await expect(updateTrainerService(formData)).resolves.toEqual({
      ok: false,
      error: 'No tienes permiso para modificar este servicio.',
    })
    expect(supabase.update).not.toHaveBeenCalled()
  })

  it.each(['priceMinor', 'price_minor', 'billingInterval', 'billing_interval'])('rejects injected %s on update before the ownership query', async field => {
    const supabase = servicesSupabase({})
    requireActiveTrainerContext.mockResolvedValue({ trainerProfile: { id: 'trainer-profile-1' }, supabase })
    const formData = validServiceForm()
    formData.set('serviceId', 'service-1')
    formData.set(field, '1000')
    const { updateTrainerService } = await import('../trainerServices')

    await expect(updateTrainerService(formData)).resolves.toEqual({
      ok: false,
      error: 'Revisa los campos del servicio.',
      fieldErrors: { commercial: 'Los servicios no admiten precios ni facturación.' },
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns a safe error when the service write fails in Supabase', async () => {
    const update = vi.fn(() => ({
      eq: () => ({
        eq: () => ({
          select: () => ({ single: async () => ({ data: null, error: { message: 'write failed' } }) }),
        }),
      }),
    }))
    const supabase = servicesSupabase({ update })
    requireActiveTrainerContext.mockResolvedValue({ trainerProfile: { id: 'trainer-profile-1' }, supabase })
    const formData = validServiceForm()
    formData.set('serviceId', 'service-1')
    const { updateTrainerService } = await import('../trainerServices')

    await expect(updateTrainerService(formData)).resolves.toEqual({
      ok: false,
      error: 'No se pudo guardar el servicio.',
    })
  })

  it('changes only the granted active-state column on an owned service', async () => {
    const supabase = servicesSupabase({ existing: { id: 'service-1' } })
    requireActiveTrainerContext.mockResolvedValue({ trainerProfile: { id: 'trainer-profile-1' }, supabase })
    const formData = new FormData()
    formData.set('serviceId', 'service-1')
    formData.set('isActive', 'false')
    const { setTrainerServiceActive } = await import('../trainerServices')

    await expect(setTrainerServiceActive(formData)).resolves.toEqual({ ok: true, serviceId: 'service-1', isActive: false })
    expect(supabase.update).toHaveBeenCalledWith({ is_active: false })
    expect(revalidatePath).toHaveBeenCalledWith('/coach/services')
  })

  it('does not toggle a service outside the active trainer ownership boundary', async () => {
    const supabase = servicesSupabase({ existing: null })
    requireActiveTrainerContext.mockResolvedValue({ trainerProfile: { id: 'trainer-profile-1' }, supabase })
    const formData = new FormData()
    formData.set('serviceId', 'other-service')
    formData.set('isActive', 'false')
    const { setTrainerServiceActive } = await import('../trainerServices')

    await expect(setTrainerServiceActive(formData)).resolves.toEqual({
      ok: false,
      error: 'No tienes permiso para modificar este servicio.',
    })
    expect(supabase.update).not.toHaveBeenCalled()
  })

  it.each(['price', 'price_minor', 'billingInterval', 'billing_interval'])('rejects injected %s before toggle ownership or writes', async field => {
    const supabase = servicesSupabase({})
    requireActiveTrainerContext.mockResolvedValue({ trainerProfile: { id: 'trainer-profile-1' }, supabase })
    const formData = new FormData()
    formData.set('serviceId', 'service-1')
    formData.set('isActive', 'false')
    formData.set(field, '1000')
    const { setTrainerServiceActive } = await import('../trainerServices')

    await expect(setTrainerServiceActive(formData)).resolves.toEqual({
      ok: false,
      error: 'Revisa los campos del servicio.',
      fieldErrors: { commercial: 'Los servicios no admiten precios ni facturación.' },
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
