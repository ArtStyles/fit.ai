import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  INITIAL_TRAINING_SETTINGS_STATE,
  updateTrainingSettings,
} from '../settings'

function validTrainingForm(overrides: Record<string, string | string[]> = {}) {
  const form = new FormData()
  const values: Record<string, string | string[]> = {
    primaryGoal: 'build_muscle',
    fitnessLevel: 'intermediate',
    daysPerWeek: '3',
    sessionDurationMinutes: '60',
    gymType: 'home_basic',
    preferredWorkoutDays: ['1', '3', '5'],
    availableEquipment: ['dumbbells', 'resistance_bands'],
    injuries: '',
    ...overrides,
  }

  for (const [key, raw] of Object.entries(values)) {
    for (const value of Array.isArray(raw) ? raw : [raw]) form.append(key, value)
  }

  return form
}

function mockCreateClient({
  user,
  from,
}: {
  user: { id: string } | null
  from: ReturnType<typeof vi.fn>
}) {
  createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
  } as never)
}

describe('updateTrainingSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid values before opening a profiles query', async () => {
    const from = vi.fn()
    mockCreateClient({ user: { id: 'user-1' }, from })
    const form = validTrainingForm({ sessionDurationMinutes: '20' })

    const result = await updateTrainingSettings(INITIAL_TRAINING_SETTINGS_STATE, form)

    expect(result.ok).toBe(false)
    expect(result.fieldErrors.sessionDurationMinutes).toBeTruthy()
    expect(from).not.toHaveBeenCalled()
  })

  it('updates only the authenticated profile with normalized values', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn((table: string) => {
      expect(table).toBe('profiles')
      return { update }
    })
    mockCreateClient({ user: { id: 'user-1' }, from })

    const result = await updateTrainingSettings(
      INITIAL_TRAINING_SETTINGS_STATE,
      validTrainingForm(),
    )

    expect(result).toMatchObject({ ok: true, message: 'Preferencias guardadas.' })
    expect(update).toHaveBeenCalledWith({
      fitness_level: 'intermediate',
      primary_goal: 'build_muscle',
      days_per_week: 3,
      session_duration_minutes: 60,
      gym_type: 'home_basic',
      available_equipment: ['dumbbells', 'resistance_bands'],
      injuries: null,
      preferred_workout_days: [1, 3, 5],
      last_check_in_at: expect.any(String),
    })
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('returns an authentication error without opening a profiles query', async () => {
    const from = vi.fn()
    mockCreateClient({ user: null, from })

    await expect(updateTrainingSettings(
      INITIAL_TRAINING_SETTINGS_STATE,
      validTrainingForm(),
    )).resolves.toEqual({
      ok: false,
      message: null,
      formError: 'Sesión no válida.',
      fieldErrors: {},
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('never opens a workout-plan table', async () => {
    const tables: string[] = []
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn((table: string) => {
      tables.push(table)
      return { update }
    })
    mockCreateClient({ user: { id: 'user-1' }, from })

    await updateTrainingSettings(INITIAL_TRAINING_SETTINGS_STATE, validTrainingForm())

    expect(tables).toEqual(['profiles'])
  })

  it('keeps the existing FormData form action callable until the stateful consumer migrates', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn(() => ({ eq }))
    const from = vi.fn(() => ({ update }))
    mockCreateClient({ user: { id: 'user-1' }, from })

    await expect((updateTrainingSettings as unknown as (
      formData: FormData,
    ) => Promise<void>)(validTrainingForm())).resolves.toBeUndefined()

    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })
})
