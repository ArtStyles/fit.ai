import { describe, expect, it, vi } from 'vitest'
import type { Database } from '@/types/database'

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: createClientMock }))

import {
  decodeDirectoryCursor,
  encodeDirectoryCursor,
  getTrainerDirectory,
  normalizeDirectoryFilters,
  type PublicTrainerDirectoryRow,
} from '../directory'

type DirectoryViewRow = Database['public']['Views']['active_trainer_directory']['Row']

function directoryRow(overrides: Partial<DirectoryViewRow> = {}): DirectoryViewRow {
  return {
    user_id: '11111111-1111-4111-8111-111111111111',
    slug: 'ada-lovelace',
    professional_name: 'Ada Lovelace',
    professional_photo_url: null,
    bio: 'Fuerza para todas las personas.',
    specialties: ['Fuerza'],
    modalities: ['hybrid'],
    experience_summary: 'Diez años de experiencia.',
    general_location: 'La Habana',
    languages: ['Español'],
    verified_at: '2026-08-08T00:00:00.000Z',
    directory_search: 'ada lovelace fuerza para todas las personas diez años de experiencia la habana fuerza español',
    specialties_search: 'fuerza',
    languages_search: 'español',
    active_services: [],
    ...overrides,
  }
}

function queryClient(rows: DirectoryViewRow[]) {
  const operations: Array<{ method: string; args: unknown[] }> = []
  const query = {
    ilike: (column: string, pattern: string) => {
      operations.push({ method: 'ilike', args: [column, pattern] })
      return query
    },
    contains: (column: string, values: string[]) => {
      operations.push({ method: 'contains', args: [column, values] })
      return query
    },
    or: (predicate: string) => {
      operations.push({ method: 'or', args: [predicate] })
      return query
    },
    order: (column: string, options: { ascending: boolean }) => {
      operations.push({ method: 'order', args: [column, options] })
      return query
    },
    limit: async (value: number) => {
      operations.push({ method: 'limit', args: [value] })
      return { data: rows, error: null }
    },
  }
  const select = vi.fn(() => query)
  const from = vi.fn(() => ({ select }))
  return { client: { from }, operations, from, select }
}

describe('trainer directory filters', () => {
  it('normalizes every public filter before it is used by the query', () => {
    expect(normalizeDirectoryFilters({
      text: '  Ada   Lovelace  ',
      specialty: '  Fuerza  ',
      modality: ' HYBRID ',
      language: '  Español ',
      location: '  La   Habana ',
    })).toEqual({
      text: 'ada lovelace',
      specialty: 'fuerza',
      modality: 'hybrid',
      language: 'español',
      location: 'la habana',
    })
  })

  it('uses an opaque stable cursor based on professional name and user id', () => {
    const cursor = encodeDirectoryCursor({
      professionalName: 'Ada Lovelace',
      userId: '11111111-1111-4111-8111-111111111111',
    })

    expect(decodeDirectoryCursor(cursor)).toEqual({
      professionalName: 'Ada Lovelace',
      userId: '11111111-1111-4111-8111-111111111111',
    })
    expect(decodeDirectoryCursor('not-a-cursor')).toBeNull()
  })

  it('defines the public row without commercial, contact, credential, review, or capacity data', () => {
    const row: PublicTrainerDirectoryRow = {
      userId: '11111111-1111-4111-8111-111111111111',
      slug: 'ada-lovelace',
      professionalName: 'Ada Lovelace',
      professionalPhotoUrl: null,
      bio: 'Entrenadora de fuerza.',
      specialties: ['Fuerza'],
      modalities: ['online'],
      experienceSummary: 'Ocho años de experiencia.',
      generalLocation: 'La Habana',
      languages: ['Español'],
      verifiedAt: '2026-08-08T00:00:00.000Z',
      services: [{
        name: 'Acompañamiento de fuerza',
        description: 'Planificación semanal.',
        modality: 'online',
        durationMinutes: 60,
        content: 'Seguimiento de entrenamiento.',
      }],
    }

    expect(Object.keys(row)).not.toEqual(expect.arrayContaining([
      'email', 'phone', 'contact', 'credentials', 'interview', 'notes',
      'priceMinor', 'currency', 'billingInterval', 'capacity', 'maxClients',
      'sourceApplicationId', 'storagePath',
    ]))
    expect(Object.keys(row.services[0]!)).not.toEqual(expect.arrayContaining([
      'id', 'priceMinor', 'currency', 'billingInterval', 'capacity', 'maxClients',
    ]))
  })

  it('executes the real directory query with all normalized filters and escaped LIKE literals', async () => {
    const fake = queryClient([])
    createClientMock.mockResolvedValueOnce(fake.client)

    await getTrainerDirectory({
      filters: {
        text: '  100%_\\ "Ada"  ',
        specialty: ' Fuerza% ',
        modality: ' HYBRID ',
        language: ' Español_ ',
        location: ' La_Habana ',
      },
    })

    expect(fake.from).toHaveBeenCalledWith('active_trainer_directory')
    expect(fake.operations).toEqual([
      { method: 'ilike', args: ['directory_search', '%100\\%\\_\\\\ "ada"%'] },
      { method: 'ilike', args: ['specialties_search', '%fuerza\\%%'] },
      { method: 'contains', args: ['modalities', ['hybrid']] },
      { method: 'ilike', args: ['languages_search', '%español\\_%'] },
      { method: 'ilike', args: ['general_location', '%la\\_habana%'] },
      { method: 'order', args: ['professional_name', { ascending: true }] },
      { method: 'order', args: ['user_id', { ascending: true }] },
      { method: 'limit', args: [13] },
    ])
  })

  it('uses the user-id tie-breaker in the real cursor predicate and returns limit plus one without duplicates', async () => {
    const firstUserId = '11111111-1111-4111-8111-111111111111'
    const secondUserId = '22222222-2222-4222-8222-222222222222'
    const thirdUserId = '33333333-3333-4333-8333-333333333333'
    const firstPage = queryClient([
      directoryRow({ user_id: firstUserId, professional_name: 'Same Name', slug: 'same-name-one' }),
      directoryRow({ user_id: secondUserId, professional_name: 'Same Name', slug: 'same-name-two' }),
      directoryRow({ user_id: thirdUserId, professional_name: 'Zed Name', slug: 'zed-name' }),
    ])
    createClientMock.mockResolvedValueOnce(firstPage.client)

    const page = await getTrainerDirectory({ limit: 2 })
    expect(page.trainers.map(trainer => trainer.userId)).toEqual([firstUserId, secondUserId])
    expect(page.nextCursor).toBe(encodeDirectoryCursor({ professionalName: 'Same Name', userId: secondUserId }))
    expect(firstPage.operations.slice(-3)).toEqual([
      { method: 'order', args: ['professional_name', { ascending: true }] },
      { method: 'order', args: ['user_id', { ascending: true }] },
      { method: 'limit', args: [3] },
    ])

    const secondPage = queryClient([directoryRow({ user_id: thirdUserId, professional_name: 'Zed Name', slug: 'zed-name' })])
    createClientMock.mockResolvedValueOnce(secondPage.client)
    const continued = await getTrainerDirectory({ limit: 2, cursor: page.nextCursor ?? undefined })

    expect(continued.trainers.map(trainer => trainer.userId)).toEqual([thirdUserId])
    expect(secondPage.operations[0]).toEqual({
      method: 'or',
      args: ['professional_name.gt."Same Name",and(professional_name.eq."Same Name",user_id.gt."22222222-2222-4222-8222-222222222222")'],
    })
  })

  it('serializes quotes and backslashes inside a validated cursor and ignores invalid cursors', async () => {
    const cursor = encodeDirectoryCursor({
      professionalName: 'Ada "quoted" \\ trainer',
      userId: '11111111-1111-4111-8111-111111111111',
    })
    const escaped = queryClient([])
    createClientMock.mockResolvedValueOnce(escaped.client)
    await getTrainerDirectory({ cursor })
    expect(escaped.operations[0]).toEqual({
      method: 'or',
      args: ['professional_name.gt."Ada \\"quoted\\" \\\\ trainer",and(professional_name.eq."Ada \\"quoted\\" \\\\ trainer",user_id.gt."11111111-1111-4111-8111-111111111111")'],
    })

    const invalid = queryClient([])
    createClientMock.mockResolvedValueOnce(invalid.client)
    await getTrainerDirectory({ cursor: 'invalid-cursor' })
    expect(invalid.operations.some(operation => operation.method === 'or')).toBe(false)
  })

  it('maps exactly the public active-service shape while preserving service order and null public fields', async () => {
    const fake = queryClient([directoryRow({
      professional_photo_url: null,
      general_location: null,
      active_services: [
        { name: 'Primer servicio', description: '', modality: 'online', duration_minutes: 30, content: '' },
        { name: 'Segundo servicio', description: 'Descripción', modality: 'hybrid', duration_minutes: 60, content: 'Contenido' },
      ],
    })])
    createClientMock.mockResolvedValueOnce(fake.client)

    const directory = await getTrainerDirectory()
    expect(directory.trainers[0]).toMatchObject({ professionalPhotoUrl: null, generalLocation: null })
    expect(directory.trainers[0]?.services).toEqual([
      { name: 'Primer servicio', description: '', modality: 'online', durationMinutes: 30, content: '' },
      { name: 'Segundo servicio', description: 'Descripción', modality: 'hybrid', durationMinutes: 60, content: 'Contenido' },
    ])
  })
})
