import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createClient, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { deleteMeasurement, logMeasurement, updateMeasurement } from '../measurements'

const userId = '10000000-0000-4000-8000-000000000001'
const measurementId = '20000000-0000-4000-8000-000000000001'
const invalidId = 'not-a-measurement-id'
const revalidatedPaths = ['/medidas', '/settings/datos', '/dashboard', '/progress']

function mockClient(user: { id: string } | null, from: ReturnType<typeof vi.fn>) {
  createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from,
  } as never)
}

function mutationChain(result: { data: { id: string } | null; error: { message: string } | null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  chain.eq = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.single = vi.fn(async () => result)
  chain.maybeSingle = vi.fn(async () => result)
  return chain
}

function expectSuccessfulRevalidation() {
  expect(revalidatePath.mock.calls.map(([path]) => path)).toEqual(revalidatedPaths)
}

describe('measurement actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('authenticates before validating and never opens a query for an anonymous caller', async () => {
    const from = vi.fn()
    mockClient(null, from)

    await expect(logMeasurement({ weight_kg: '72.5' } as never)).resolves.toEqual({
      success: false,
      error: 'No autenticado',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('returns field errors for an invalid create payload before opening a mutation query', async () => {
    const from = vi.fn()
    mockClient({ id: userId }, from)

    const result = await logMeasurement({ weight_kg: 301 })

    expect(result).toMatchObject({
      success: false,
      error: expect.any(String),
      fieldErrors: { weight_kg: expect.any(String) },
    })
    expect(from).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('inserts the normalized payload for the authenticated user and revalidates all consumers', async () => {
    const chain = mutationChain({ data: { id: measurementId }, error: null })
    const insert = vi.fn(() => chain)
    const from = vi.fn(() => ({ insert }))
    mockClient({ id: userId }, from)

    await expect(logMeasurement({ weight_kg: 72.5, notes: '  progreso  ' })).resolves.toEqual({
      success: true,
      id: measurementId,
    })
    expect(from).toHaveBeenCalledWith('measurements')
    expect(insert).toHaveBeenCalledWith({
      user_id: userId,
      weight_kg: 72.5,
      notes: 'progreso',
      recorded_at: expect.any(String),
    })
    expectSuccessfulRevalidation()
  })

  it('returns stable create copy and does not revalidate when Supabase fails', async () => {
    const chain = mutationChain({ data: null, error: { message: 'sensitive database detail' } })
    const from = vi.fn(() => ({ insert: vi.fn(() => chain) }))
    mockClient({ id: userId }, from)

    await expect(logMeasurement({ weight_kg: 72.5 })).resolves.toEqual({
      success: false,
      error: 'No se pudo guardar la medida.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects an invalid update id before opening a mutation query', async () => {
    const from = vi.fn()
    mockClient({ id: userId }, from)

    await expect(updateMeasurement(invalidId, { weight_kg: 72.5 })).resolves.toEqual({
      success: false,
      error: 'Identificador de medida inválido.',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('updates only the authenticated row, preserves explicit null and confirms its id', async () => {
    const chain = mutationChain({ data: { id: measurementId }, error: null })
    const update = vi.fn(() => chain)
    const from = vi.fn(() => ({ update }))
    mockClient({ id: userId }, from)

    await expect(updateMeasurement(measurementId, {
      weight_kg: null,
      notes: '  corrección  ',
    })).resolves.toEqual({ success: true, id: measurementId })
    expect(update).toHaveBeenCalledWith({ weight_kg: null, notes: 'corrección' })
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'id', measurementId)
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'user_id', userId)
    expect(chain.select).toHaveBeenCalledWith('id')
    expectSuccessfulRevalidation()
  })

  it.each([
    [{ data: null, error: null }, 'a missing row'],
    [{ data: null, error: { message: 'sensitive database detail' } }, 'a database failure'],
  ])('does not report update success for %s (%s)', async (databaseResult, _scenario) => {
    const chain = mutationChain(databaseResult)
    const from = vi.fn(() => ({ update: vi.fn(() => chain) }))
    mockClient({ id: userId }, from)

    await expect(updateMeasurement(measurementId, { weight_kg: 72.5 })).resolves.toEqual({
      success: false,
      error: 'No se pudo actualizar la medida.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects an invalid delete id before opening a mutation query', async () => {
    const from = vi.fn()
    mockClient({ id: userId }, from)

    await expect(deleteMeasurement(invalidId)).resolves.toEqual({
      success: false,
      error: 'Identificador de medida inválido.',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('deletes only the authenticated row after Supabase confirms it and revalidates consumers', async () => {
    const chain = mutationChain({ data: { id: measurementId }, error: null })
    const remove = vi.fn(() => chain)
    const from = vi.fn(() => ({ delete: remove }))
    mockClient({ id: userId }, from)

    await expect(deleteMeasurement(measurementId)).resolves.toEqual({ success: true })
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'id', measurementId)
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'user_id', userId)
    expect(chain.select).toHaveBeenCalledWith('id')
    expectSuccessfulRevalidation()
  })

  it.each([
    [{ data: null, error: null }, 'a missing row'],
    [{ data: null, error: { message: 'sensitive database detail' } }, 'a database failure'],
  ])('does not report delete success for %s (%s)', async (databaseResult, _scenario) => {
    const chain = mutationChain(databaseResult)
    const from = vi.fn(() => ({ delete: vi.fn(() => chain) }))
    mockClient({ id: userId }, from)

    await expect(deleteMeasurement(measurementId)).resolves.toEqual({
      success: false,
      error: 'No se pudo eliminar la medida.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
