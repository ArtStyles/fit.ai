import { describe, expect, it } from 'vitest'
import {
  decodeDirectoryCursor,
  encodeDirectoryCursor,
  normalizeDirectoryFilters,
  type PublicTrainerDirectoryRow,
} from '../directory'

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
})
