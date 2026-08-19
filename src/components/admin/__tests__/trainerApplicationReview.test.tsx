import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const adminContext = vi.hoisted(() => ({ service: undefined as unknown }))

vi.mock('server-only', () => ({}))
vi.mock('@/components/feedback/SubmitButton', () => ({
  SubmitButton: ({ label, disabled }: { label: string; disabled?: boolean }) => (
    <button type="submit" disabled={disabled}>{label}</button>
  ),
}))
vi.mock('@/lib/auth/admin', () => ({
  requireAdminUserContext: async () => ({
    user: { id: 'admin-user' },
    service: adminContext.service,
  }),
}))

import {
  countAdminTrainerApplicationsRequiringAttention,
  getAdminTrainerApplication,
  loadAdminTrainerApplications,
  listAdminTrainerApplications,
} from '@/lib/auth/adminTrainers'
import {
  TrainerApplicationQueue,
  TrainerApplicationReview,
} from '../TrainerApplicationReview'

const APPLICATION_ID = '11111111-1111-4111-8111-111111111111'
const CREDENTIAL_SOURCE_APPLICATION_ID = '19999999-9999-4999-8999-999999999999'

const privateApplicationRow = {
  id: APPLICATION_ID,
  user_id: '22222222-2222-4222-8222-222222222222',
  application_kind: 'initial',
  source_profile_id: null,
  credential_source_application_id: null,
  status: 'submitted',
  professional_name: 'Ada Entrenadora',
  professional_photo_url: 'https://cdn.example.test/ada.jpg',
  bio: 'Entrenadora de fuerza y movilidad.',
  specialties: ['Fuerza', 'Movilidad'],
  modalities: ['online'],
  experience_summary: 'Ocho años de experiencia profesional.',
  general_location: 'La Habana',
  languages: ['Español'],
  contact_email: 'ada.private@example.test',
  contact_phone: '+53 5555 0101',
  preferred_contact: 'email',
  timezone: 'America/Havana',
  interview_availability: 'Lunes y miércoles después de las 15:00.',
  submitted_at: '2026-08-07T14:00:00.000Z',
  decided_at: null,
  created_at: '2026-08-06T14:00:00.000Z',
  updated_at: '2026-08-07T14:00:00.000Z',
}

function projectedRow(columns: string) {
  const selected = columns.split(',').map(column => column.trim())
  const forbidden = [
    'user_id',
    'contact_email',
    'contact_phone',
    'interview_availability',
    'professional_photo_url',
    'bio',
    'modalities',
    'experience_summary',
    'general_location',
    'languages',
    'timezone',
  ]

  if (selected.includes('*') || forbidden.some(column => selected.includes(column))) {
    throw new Error(`Private queue projection rejected: ${columns}`)
  }

  return Object.fromEntries(selected.map(column => [
    column,
    privateApplicationRow[column as keyof typeof privateApplicationRow],
  ]))
}

function queueService(
  attentionCount: number | null = 3,
  attentionFilters: string[][] = [],
) {
  return {
    from(table: string) {
      if (table !== 'trainer_applications') throw new Error(`Unexpected queue table: ${table}`)
      return {
        select(columns: string, options?: { count?: string; head?: boolean }) {
          if (options?.head) {
            const countQuery = {
              count: attentionCount,
              error: null,
              in(_column: string, statuses: string[]) {
                attentionFilters.push(statuses)
                return countQuery
              },
            }
            return countQuery
          }
          const query = {
            data: [projectedRow(columns)],
            error: null,
            eq() { return query },
            order() { return query },
            range() { return query },
          }
          return query
        },
      }
    },
  }
}

function paginatedQueueService(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, index) => ({
    ...projectedRow('id, professional_name, submitted_at, created_at, status, specialties, application_kind'),
    id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
  }))
  const ranges: Array<[number, number]> = []
  const statusFilters: Array<[string, string]> = []
  const orders: Array<[string, { ascending: boolean; nullsFirst?: boolean }]> = []
  const projections: string[] = []

  return {
    ranges,
    statusFilters,
    orders,
    projections,
    service: {
      from(table: string) {
        if (table !== 'trainer_applications') throw new Error(`Unexpected queue table: ${table}`)
        return {
          select(columns: string) {
            projectedRow(columns)
            projections.push(columns)
            const query = {
              eq(column: string, value: string) {
                statusFilters.push([column, value])
                return query
              },
              order(column: string, options: { ascending: boolean; nullsFirst?: boolean }) {
                orders.push([column, options])
                return query
              },
              range(from: number, to: number) {
                ranges.push([from, to])
                return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
              },
              then<TResult1 = unknown, TResult2 = never>(
                onfulfilled?: ((value: { data: typeof rows; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
              ) {
                return Promise.resolve({ data: rows.slice(0, 1000), error: null })
                  .then(onfulfilled, onrejected)
              },
            }
            return query
          },
        }
      },
    },
  }
}

function detailService(options: {
  applicationKind?: 'initial' | 'profile_update'
  credentialSourceApplicationId?: string | null
  credentialFilters?: Array<[string, string]>
} = {}) {
  const applicationRow = {
    ...privateApplicationRow,
    application_kind: options.applicationKind ?? 'initial',
    source_profile_id: options.applicationKind === 'profile_update' ? 'trainer-profile-1' : null,
    credential_source_application_id: options.credentialSourceApplicationId ?? null,
  }
  const credentialApplicationId = options.credentialSourceApplicationId ?? APPLICATION_ID
  const credentials = [{
    id: '33333333-3333-4333-8333-333333333333',
    application_id: credentialApplicationId,
    credential_type: 'document',
    title: 'Certificación privada',
    issuer: 'Academia Ejemplo',
    issued_on: '2024-01-10',
    expires_on: null,
    storage_path: '22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.pdf',
    external_url: null,
    mime_type: 'application/pdf',
    size_bytes: 2048,
    created_at: '2026-08-07T13:00:00.000Z',
  }]
  const events = [{
    id: '44444444-4444-4444-8444-444444444444',
    application_id: APPLICATION_ID,
    from_status: null,
    to_status: 'submitted',
    public_note: 'Solicitud enviada.',
    internal_note: 'Revisar la vigencia del certificado.',
    actor_role: 'applicant',
    created_at: '2026-08-07T14:00:00.000Z',
  }]
  const interviews = [{
    id: '55555555-5555-4555-8555-555555555555',
    application_id: APPLICATION_ID,
    proposed_at: '2026-08-10T18:30:00.000Z',
    timezone: 'America/Havana',
    medium: 'video_call',
    external_url: 'https://meet.example.test/private-room',
    status: 'proposed',
    outcome: null,
    public_note: 'Ten tus credenciales a mano.',
    internal_note: 'Confirmar experiencia en movilidad.',
    created_at: '2026-08-08T12:00:00.000Z',
    updated_at: '2026-08-08T12:00:00.000Z',
  }]

  return {
    from(table: string) {
      const rows = table === 'trainer_applications'
        ? [applicationRow]
        : table === 'trainer_application_credentials'
          ? credentials
          : table === 'trainer_application_events'
            ? events
            : table === 'trainer_interviews'
              ? interviews
              : (() => { throw new Error(`Unexpected detail table: ${table}`) })()
      const query = {
        data: rows,
        error: null,
        eq(column: string, value: string) {
          if (table === 'trainer_application_credentials') options.credentialFilters?.push([column, value])
          return query
        },
        order() { return query },
        async maybeSingle() { return { data: rows[0] ?? null, error: null } },
      }
      return { select() { return query } }
    },
    storage: {
      from(bucket: string) {
        if (bucket !== 'trainer-credentials') throw new Error(`Unexpected bucket: ${bucket}`)
        return {
          async createSignedUrl(path: string, expiresIn: number) {
            return {
              data: { signedUrl: `https://storage.example.test/${path}?expiresIn=${expiresIn}` },
              error: null,
            }
          },
          getPublicUrl() {
            throw new Error('Credential documents must never use public URLs.')
          },
        }
      },
    },
  }
}

describe('trainer administration privacy', () => {
  beforeEach(() => {
    adminContext.service = undefined
  })

  it('keeps the queue projection and rendered list free of private application data', async () => {
    adminContext.service = queueService()

    const applications = await listAdminTrainerApplications('submitted')
    const html = renderToStaticMarkup(
      <TrainerApplicationQueue applications={applications} selectedStatus="submitted" timeZone="America/Havana" />,
    )

    expect(applications).toEqual([{
      id: APPLICATION_ID,
      professionalName: 'Ada Entrenadora',
      applicationDate: '2026-08-07T14:00:00.000Z',
      status: 'submitted',
      specialties: ['Fuerza', 'Movilidad'],
      applicationKind: 'initial',
    }])
    expect(html).toContain('Ada Entrenadora')
    expect(html).toContain('Fuerza')
    expect(html).toContain('Enviada')
    expect(html).toContain('Solicitud inicial')
    expect(html).toContain('1 solicitud en la cola')
    expect(html).toContain('min-h-11')
    expect(html).not.toContain('ada.private@example.test')
    expect(html).not.toContain('Revisar la vigencia')
    expect(html).not.toContain('storage.example.test')
  })

  it('paginates the ordered private queue without losing the selected status', async () => {
    const fixture = paginatedQueueService(1001)

    const applications = await loadAdminTrainerApplications(
      fixture.service as never,
      'submitted',
    )

    expect(applications).toHaveLength(1001)
    expect(fixture.ranges).toEqual([[0, 999], [1000, 1999]])
    expect(fixture.statusFilters).toEqual([
      ['status', 'submitted'],
      ['status', 'submitted'],
    ])
    expect(fixture.orders).toEqual([
      ['submitted_at', { ascending: false, nullsFirst: false }],
      ['created_at', { ascending: false }],
      ['submitted_at', { ascending: false, nullsFirst: false }],
      ['created_at', { ascending: false }],
    ])
    expect(fixture.projections).toEqual([
      'id, professional_name, submitted_at, created_at, status, specialties, application_kind',
      'id, professional_name, submitted_at, created_at, status, specialties, application_kind',
    ])
  })

  it('counts only attention statuses for the admin navigation badge', async () => {
    const attentionFilters: string[][] = []
    const service = queueService(3, attentionFilters)

    await expect(
      countAdminTrainerApplicationsRequiringAttention(service as never),
    ).resolves.toBe(3)
    expect(attentionFilters).toEqual([[
      'submitted',
      'under_review',
      'interview_required',
    ]])
  })

  it('rejects an unavailable attention count instead of fabricating zero', async () => {
    const service = queueService(null)

    await expect(
      countAdminTrainerApplicationsRequiringAttention(service as never),
    ).rejects.toThrow('No se pudo cargar el contador de solicitudes.')
  })

  it('identifies profile updates and resolves credentials from their approved source application', async () => {
    const credentialFilters: Array<[string, string]> = []
    adminContext.service = detailService({
      applicationKind: 'profile_update',
      credentialSourceApplicationId: CREDENTIAL_SOURCE_APPLICATION_ID,
      credentialFilters,
    })

    const application = await getAdminTrainerApplication(APPLICATION_ID)

    expect(application?.applicationKind).toBe('profile_update')
    expect(credentialFilters).toContainEqual(['application_id', CREDENTIAL_SOURCE_APPLICATION_ID])
    const html = renderToStaticMarkup(<TrainerApplicationReview application={application!} timeZone="America/Havana" />)
    expect(html).toContain('Actualización de perfil')
    expect(html).toContain('Credenciales verificadas en la solicitud aprobada')
  })

  it('reveals private fields only in the expediente and signs documents for at most five minutes', async () => {
    adminContext.service = detailService()

    const application = await getAdminTrainerApplication(APPLICATION_ID)
    expect(application).not.toBeNull()
    if (!application) throw new Error('Expected the application expediente.')

    const documentUrl = new URL(application.credentials[0].url ?? '')
    expect(Number(documentUrl.searchParams.get('expiresIn'))).toBeGreaterThan(0)
    expect(Number(documentUrl.searchParams.get('expiresIn'))).toBeLessThanOrEqual(300)
    expect(application.credentials[0]).not.toHaveProperty('storagePath')

    const html = renderToStaticMarkup(<TrainerApplicationReview application={application} timeZone="America/Havana" />)
    expect(html).toContain('ada.private@example.test')
    expect(html).toContain('Lunes y miércoles después de las 15:00.')
    expect(html).toContain('Revisar la vigencia del certificado.')
    expect(html).toContain(`href="${application.credentials[0].url?.replaceAll('&', '&amp;')}"`)
    const links = html.match(/<a\b[^>]*>/g) ?? []
    const contactLink = links.find(link => link.includes('mailto:')) ?? ''
    const credentialLink = links.find(link => link.includes('storage.example.test')) ?? ''
    const interviewLink = links.find(link => link.includes('meet.example.test')) ?? ''
    for (const link of [contactLink, credentialLink, interviewLink]) {
      expect(link).toContain('min-h-11')
      expect(link).toContain('min-w-11')
      expect(link).toContain('focus-visible:ring-2')
    }
    expect(html).not.toMatch(/peso|medidas corporales|plan de entrenamiento|progreso|precio|clientes/i)
  })

  it('renders only the real review, correction, interview and decision controls', async () => {
    adminContext.service = detailService()
    const application = await getAdminTrainerApplication(APPLICATION_ID)
    if (!application) throw new Error('Expected the application expediente.')

    const html = renderToStaticMarkup(<TrainerApplicationReview application={application} timeZone="America/Havana" />)

    expect(html).toContain('Iniciar revisi')
    expect(html).toContain('Solicitar cambios')
    expect(html).toContain('Programar entrevista')
    expect(html).toContain('Registrar resultado')
    expect(html).toContain('Aprobar solicitud')
    expect(html).toContain('Rechazar solicitud')
    expect(html).toContain('name="publicNote"')
    expect(html).toContain('name="internalNote"')
    expect(html).toContain('name="proposedAt"')
    expect(html).toContain('name="externalUrl"')
    const actionTargets = html.match(/<(?:button|summary)\b[^>]*>/g) ?? []
    expect(actionTargets.length).toBeGreaterThan(0)
    expect(actionTargets.every(target => target.includes('min-h-11'))).toBe(true)
    expect(html).not.toMatch(/enviar correo|chat privado|crear videollamada/i)
  })

  it('keeps the review panel open and exposes local field validation in an aria-live region', async () => {
    adminContext.service = detailService()
    const application = await getAdminTrainerApplication(APPLICATION_ID)
    if (!application) throw new Error('Expected the application expediente.')

    const html = renderToStaticMarkup(createElement(TrainerApplicationReview as any, {
      application: { ...application, status: 'under_review' },
      initialActionStates: {
        scheduleInterview: {
          ok: false,
          error: 'Revisa los datos de la entrevista.',
          fieldErrors: { proposedAt: 'La fecha local no existe o es ambigua.' },
        },
      },
    }))

    expect(html).toContain('<details open=""')
    expect(html).toContain('aria-live="assertive"')
    expect(html).toContain('Revisa los datos de la entrevista.')
    expect(html).toContain('La fecha local no existe o es ambigua.')
    expect(html).toMatch(/name="proposedAt"[^>]*aria-invalid="true"/)
  })

  it('offers an explicit profile reinstatement action for an approved trainer without implying client reactivation', async () => {
    adminContext.service = detailService()
    const application = await getAdminTrainerApplication(APPLICATION_ID)
    if (!application) throw new Error('Expected the application expediente.')

    const html = renderToStaticMarkup(createElement(TrainerApplicationReview as any, {
      application: { ...application, status: 'approved' },
    }))

    expect(html).toContain('Restablecer perfil profesional')
    expect(html).toContain('name="applicationId"')
    expect(html).toContain('No reanuda acompa')
  })

  it('renders an RPC conflict as an error instead of a successful approval', async () => {
    adminContext.service = detailService()
    const application = await getAdminTrainerApplication(APPLICATION_ID)
    if (!application) throw new Error('Expected the application expediente.')

    const html = renderToStaticMarkup(createElement(TrainerApplicationReview as any, {
      application: { ...application, status: 'under_review' },
      initialActionStates: {
        approve: { ok: false, error: 'La solicitud cambio mientras la revisabas.' },
      },
    }))

    expect(html).toContain('La solicitud cambio mientras la revisabas.')
    expect(html).not.toContain('Aprobacion guardada')
  })
})
