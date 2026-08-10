import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PublicTrainerDirectoryRow } from '@/lib/coaching/directory'
import { TrainerDirectory } from '../TrainerDirectory'
import { TrainerPublicProfile } from '../TrainerPublicProfile'

const TRAINER: PublicTrainerDirectoryRow = {
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
    modality: 'online' as const,
    durationMinutes: 60,
    content: 'Seguimiento de entrenamiento.',
  }],
}

describe('TrainerDirectory', () => {
  it('renders only the public profile information and filter fields', () => {
    const html = renderToStaticMarkup(
      <TrainerDirectory trainers={[TRAINER]} filters={{}} nextCursor={null} />,
    )

    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Verificado')
    expect(html).toContain('Especialidad')
    expect(html).toContain('Modalidad')
    expect(html).not.toMatch(/precio|reseña|ranking|contacto|credencial/i)
  })
})

describe('TrainerPublicProfile', () => {
  it('shows verified active services and omits commercial or private information', () => {
    const html = renderToStaticMarkup(<TrainerPublicProfile trainer={TRAINER} />)

    expect(html).toContain('Perfil verificado')
    expect(html).toContain('Acompañamiento de fuerza')
    expect(html).toContain('Ocho años de experiencia.')
    expect(html).not.toMatch(/precio|capacidad|contacto|reseña|ranking/i)
  })

  it('keeps an active trainer without services visible with an empty active-service list', () => {
    const html = renderToStaticMarkup(
      <TrainerPublicProfile trainer={{ ...TRAINER, services: [] }} />,
    )

    expect(html).toContain('Aún no ha publicado servicios activos.')
  })
})
