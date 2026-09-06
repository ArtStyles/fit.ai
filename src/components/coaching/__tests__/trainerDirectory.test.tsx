import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ClientCoachingSummary } from '@/lib/coaching/clientSummary'
import type { PublicTrainerDirectoryRow } from '@/lib/coaching/directory'
import { TrainerDirectory } from '../TrainerDirectory'
import { TrainerPublicProfile } from '../TrainerPublicProfile'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

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

const COACHING_SUMMARY: ClientCoachingSummary = {
  relationshipId: 'relationship-1',
  relationshipStatus: 'active',
  trainerUserId: TRAINER.userId,
  trainerName: TRAINER.professionalName,
  trainerAvatarUrl: null,
  trainerSlug: TRAINER.slug,
  serviceId: 'service-1',
  serviceName: 'Acompañamiento de fuerza',
  startedAt: '2026-09-01T10:00:00.000Z',
  trainingConsentActive: true,
  assignmentStatus: 'active',
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

  it('keeps search prominent and summarizes active filters outside the advanced panel', () => {
    const html = renderToStaticMarkup(
      <TrainerDirectory
        trainers={[TRAINER]}
        filters={{ specialty: 'fuerza', modality: 'online', language: 'español' }}
        nextCursor={null}
      />,
    )

    expect(html).toContain('placeholder="Buscar por nombre o experiencia"')
    expect(html).toContain('3 filtros activos')
    expect(html).toContain('<details')
    expect(html).toContain('Limpiar filtros')
    expect(html).toContain('La Habana')
    expect(html).toContain('Español')
    expect(html).toContain('Ver perfil')
  })

  it('keeps a plain text search separate from advanced-filter disclosure', () => {
    const searchHtml = renderToStaticMarkup(
      <TrainerDirectory trainers={[TRAINER]} filters={{ text: 'fuerza' }} nextCursor={null} />,
    )
    const specialtyHtml = renderToStaticMarkup(
      <TrainerDirectory trainers={[TRAINER]} filters={{ specialty: 'fuerza' }} nextCursor={null} />,
    )

    expect(searchHtml).not.toContain('<details class="group mt-3 rounded-xl border border-border/60 bg-muted/15" open=""')
    expect(searchHtml).not.toContain('1 filtros activos')
    expect(specialtyHtml).toContain('1 filtro activo')
  })

  it('offers a direct reset when active filters produce an empty directory', () => {
    const html = renderToStaticMarkup(
      <TrainerDirectory trainers={[]} filters={{ location: 'Santiago' }} nextCursor={null} />,
    )

    expect(html).toContain('No encontramos entrenadores con esos filtros')
    expect(html).toContain('href="/trainers"')
    expect(html).toContain('Limpiar filtros')
  })

  it('describes the visible page count without presenting it as the directory total', () => {
    const html = renderToStaticMarkup(
      <TrainerDirectory trainers={[TRAINER]} filters={{}} nextCursor="next-page" />,
    )

    expect(html).toContain('Mostrando 1 perfil')
    expect(html).not.toContain('1 entrenador disponible')
  })

  it('gives the matching trainer a contracted-coaching state and separate actions', () => {
    const html = renderToStaticMarkup(<TrainerDirectory trainers={[TRAINER]} filters={{}} nextCursor={null} coachingSummary={COACHING_SUMMARY} />)

    expect(html).toContain('Tu entrenador')
    expect(html).toContain('Acompañamiento activo')
    expect(html).toContain('Acompañamiento de fuerza')
    expect(html).toContain('href="/coaching"')
    expect(html).toContain('href="/trainers/ada-lovelace"')
  })

  it('keeps nonmatching trainer cards free of the contracted-coaching state and CTA', () => {
    const otherTrainer = { ...TRAINER, userId: '22222222-2222-4222-8222-222222222222', slug: 'grace-hopper', professionalName: 'Grace Hopper' }
    const html = renderToStaticMarkup(<TrainerDirectory trainers={[otherTrainer]} filters={{}} nextCursor={null} coachingSummary={COACHING_SUMMARY} />)

    expect(html).not.toContain('Tu entrenador')
    expect(html).not.toContain('href="/coaching"')
    expect(html).toContain('href="/trainers/grace-hopper"')
  })

  it('gives the responsive two-column cards enough room on the real route', () => {
    const page = readFileSync(new URL('../../../app/(app)/trainers/page.tsx', import.meta.url), 'utf8')
    const loading = readFileSync(new URL('../../../app/(app)/trainers/loading.tsx', import.meta.url), 'utf8')

    expect(page).toContain('max-w-4xl')
    expect(loading).toContain('max-w-4xl')
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
