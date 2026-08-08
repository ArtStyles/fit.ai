import { renderToStaticMarkup } from 'react-dom/server'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium, type Browser } from '@playwright/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ApplicationForm,
  buildTrainerContactSummary,
  prepareTrainerApplicationReview,
  persistTrainerApplicationDraft,
  type TrainerApplicationView,
} from '../ApplicationForm'
import { ApplicationTimeline } from '../ApplicationTimeline'

const APPLICATION: TrainerApplicationView = {
  id: '31111111-1111-4111-8111-111111111111',
  status: 'changes_requested',
  professionalName: 'Ada Entrenadora',
  professionalPhotoUrl: 'https://cdn.example.test/ada.jpg',
  bio: 'Entrenadora de fuerza con un enfoque progresivo, seguro y adaptado a cada persona.',
  specialties: ['Fuerza'],
  modalities: ['online'],
  experienceSummary: 'Ocho años acompañando procesos de fuerza y movilidad.',
  generalLocation: 'La Habana',
  languages: ['Español'],
  contactEmail: 'ada@example.test',
  contactPhone: '+53 5555 0101',
  preferredContact: 'email',
  timezone: 'America/Havana',
  interviewAvailability: 'De lunes a viernes después de las 15:00.',
}

const CREDENTIALS = [{
  id: '41111111-1111-4111-8111-111111111111',
  credentialType: 'link' as const,
  title: 'Certificación de fuerza',
  issuer: 'Academia Ejemplo',
  issuedOn: '2024-01-10',
  expiresOn: null,
  externalUrl: 'https://issuer.example.test/cert/ada',
  fileName: null,
}]

function validFormData(): FormData {
  const formData = new FormData()
  formData.set('professionalName', APPLICATION.professionalName)
  formData.set('professionalPhotoUrl', APPLICATION.professionalPhotoUrl ?? '')
  formData.set('bio', APPLICATION.bio)
  formData.append('specialties', 'Fuerza')
  formData.append('modalities', 'online')
  formData.set('experienceSummary', APPLICATION.experienceSummary)
  formData.set('generalLocation', APPLICATION.generalLocation ?? '')
  formData.append('languages', 'Español')
  formData.set('contactEmail', APPLICATION.contactEmail)
  formData.set('contactPhone', APPLICATION.contactPhone ?? '')
  formData.set('preferredContact', APPLICATION.preferredContact)
  formData.set('timezone', APPLICATION.timezone)
  formData.set('interviewAvailability', APPLICATION.interviewAvailability)
  return formData
}

describe('ApplicationForm', () => {
  it('renders a resumable, labelled draft without identity, price or private-message fields', () => {
    const html = renderToStaticMarkup(
      <ApplicationForm
        initialApplication={APPLICATION}
        initialCredentials={CREDENTIALS}
        allowedPhotoUrls={[APPLICATION.professionalPhotoUrl!]}
      />,
    )

    for (const label of [
      'Nombre profesional',
      'Biografía profesional',
      'Especialidades',
      'Modalidades',
      'Experiencia',
      'Idiomas',
      'Correo de contacto',
      'Teléfono de contacto',
      'Zona horaria',
      'Disponibilidad para entrevista',
    ]) expect(html).toContain(label)

    expect(html).toContain('Ada Entrenadora')
    expect(html).toContain('Certificación de fuerza')
    expect(html).toContain('Guardar borrador')
    expect(html).toContain('Revisar y enviar')
    expect(html).not.toMatch(/documento de identidad|pasaporte|precio|tarifa|mensaje privado/i)
  })

  it('returns accessible field errors instead of opening confirmation for an incomplete request', () => {
    const result = prepareTrainerApplicationReview(new FormData(), {
      allowedPhotoUrls: [],
      credentialCount: 0,
    })

    expect(result.phase).toBe('editing')
    expect(result.fieldErrors.professionalName).toBeTruthy()
    expect(result.fieldErrors.bio).toBeTruthy()
    expect(result.fieldErrors.credentials).toBeTruthy()
    expect(result.focusField).toBe('professionalName')
  })

  it('opens confirmation only after the complete application passes validation', () => {
    const result = prepareTrainerApplicationReview(validFormData(), {
      allowedPhotoUrls: [APPLICATION.professionalPhotoUrl!],
      credentialCount: 1,
    })

    expect(result).toEqual({
      phase: 'confirming',
      fieldErrors: {},
      focusField: null,
    })
  })

  it('builds the confirmation summary from the latest edited contact values', () => {
    const formData = validFormData()
    formData.set('contactEmail', 'nuevo@example.test')
    formData.set('contactPhone', '+53 5555 9999')
    formData.set('preferredContact', 'whatsapp')
    formData.set('timezone', 'America/Bogota')

    expect(buildTrainerContactSummary(formData)).toEqual({
      email: 'nuevo@example.test',
      phone: '+53 5555 9999',
      preferredContact: 'whatsapp',
      timezone: 'America/Bogota',
    })
  })

  it('preserves the returned application identity after saving a draft', async () => {
    const result = await persistTrainerApplicationDraft(validFormData(), async () => ({
      ok: true,
      applicationId: '32222222-2222-4222-8222-222222222222',
      status: 'draft',
    }))

    expect(result).toEqual({
      ok: true,
      applicationId: '32222222-2222-4222-8222-222222222222',
      status: 'draft',
      announcement: 'Borrador guardado.',
    })
  })
})

describe('ApplicationTimeline', () => {
  it('represents the review outcomes as text with their public notes', () => {
    const html = renderToStaticMarkup(
      <ApplicationTimeline
        applicantTimezone="America/Havana"
        events={[
          { id: '1', toStatus: 'changes_requested', publicNote: 'Amplía tu experiencia.', createdAt: '2026-08-05T14:00:00.000Z' },
          { id: '2', toStatus: 'interview_required', publicNote: 'Queremos conocerte.', createdAt: '2026-08-06T14:00:00.000Z' },
          { id: '3', toStatus: 'approved', publicNote: 'Perfil verificado.', createdAt: '2026-08-07T14:00:00.000Z' },
          { id: '4', toStatus: 'rejected', publicNote: 'No cumple los criterios.', createdAt: '2026-08-08T14:00:00.000Z' },
        ]}
        interview={null}
      />,
    )

    for (const label of ['Cambios solicitados', 'Entrevista requerida', 'Aprobada', 'No aprobada']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Amplía tu experiencia.')
    expect(html).toContain('No cumple los criterios.')
  })

  it('shows interview time in the applicant timezone, medium and only a safe HTTPS link', () => {
    const html = renderToStaticMarkup(
      <ApplicationTimeline
        applicantTimezone="America/Havana"
        events={[]}
        interview={{
          proposedAt: '2026-08-10T18:30:00.000Z',
          timezone: 'Europe/Madrid',
          medium: 'video_call',
          externalUrl: 'https://meet.example.test/interview/ada',
          status: 'scheduled',
          publicNote: 'Ten tus credenciales a mano.',
        }}
      />,
    )

    expect(html).toContain('America/Havana')
    expect(html).toContain('Videollamada')
    expect(html).toContain('href="https://meet.example.test/interview/ada"')
    expect(html).toContain('La coordinación usa los datos de contacto suministrados')
    expect(html).toContain('no existe mensajería privada en esta versión')
  })

  it.each([
    ['scheduled', 'Programada', true],
    ['completed', 'Completada', false],
    ['cancelled', 'Cancelada', false],
  ] as const)('represents a %s interview and exposes an action only while scheduled', (status, label, actionable) => {
    const html = renderToStaticMarkup(
      <ApplicationTimeline
        applicantTimezone="America/Havana"
        events={[]}
        interview={{
          proposedAt: '2026-08-10T18:30:00.000Z',
          timezone: 'America/Havana',
          medium: 'video_call',
          externalUrl: 'https://meet.example.test/interview/ada',
          status,
          publicNote: null,
        }}
      />,
    )

    expect(html).toContain(label)
    expect(html.includes('Abrir enlace seguro')).toBe(actionable)
    expect(html.includes('href="https://meet.example.test/interview/ada"')).toBe(actionable)
  })

  it('never renders a non-HTTPS interview destination as a link', () => {
    const html = renderToStaticMarkup(
      <ApplicationTimeline
        applicantTimezone="America/Havana"
        events={[]}
        interview={{
          proposedAt: '2026-08-10T18:30:00.000Z',
          timezone: 'America/Havana',
          medium: 'video_call',
          externalUrl: 'javascript:alert(1)',
          status: 'scheduled',
          publicNote: null,
        }}
      />,
    )

    expect(html).not.toContain('href=')
    expect(html).toContain('El enlace de la entrevista no está disponible de forma segura.')
  })
})

describe('ApplicationForm DOM accessibility', () => {
  let browser: Browser
  let viteServer: {
    listen: () => Promise<void>
    close: () => Promise<void>
    httpServer: { address: () => string | { port: number } | null }
  }
  let baseUrl = ''

  beforeAll(async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
    const viteEntry = path.join(repoRoot, 'node_modules/.pnpm/node_modules/vite/dist/node/index.js')
    const { createServer } = await import(pathToFileURL(viteEntry).href)
    viteServer = await createServer({
      configFile: false,
      root: repoRoot,
      appType: 'spa',
      oxc: { jsx: { runtime: 'automatic' } },
      resolve: {
        alias: [
          {
            find: '@/app/actions/trainerApplications',
            replacement: path.join(repoRoot, 'src/components/coaching/__tests__/fixtures/trainerApplications.fixture.ts'),
          },
          { find: '@', replacement: path.join(repoRoot, 'src') },
        ],
      },
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
    })
    await viteServer.listen()
    const address = viteServer.httpServer.address()
    if (!address || typeof address === 'string') throw new Error('Vite DOM fixture did not bind a TCP port.')
    baseUrl = `http://127.0.0.1:${address.port}`
    browser = await chromium.launch({ headless: true })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    await viteServer?.close()
  })

  it.each([
    ['photo', 'professionalPhotoUrl'],
    ['modalities', 'modalities'],
    ['credentials', 'credentials'],
  ] as const)('focuses the visible %s error target and associates its message', async (testCase, targetId) => {
    const page = await browser.newPage()
    try {
      await page.goto(`${baseUrl}/src/components/coaching/__tests__/fixtures/applicationForm.html?case=${testCase}`)
      await page.waitForFunction(() => Boolean((window as Window & { __APPLICATION_FORM_READY__?: boolean }).__APPLICATION_FORM_READY__))
      await page.getByRole('button', { name: 'Revisar y enviar' }).click()
      await page.waitForTimeout(50)

      const state = await page.evaluate(id => {
        const target = document.getElementById(id)
        const errorId = `${id}-error`
        return {
          activeId: document.activeElement?.id ?? null,
          describedBy: target?.getAttribute('aria-describedby') ?? null,
          errorText: document.getElementById(errorId)?.textContent?.trim() ?? null,
          hidden: target instanceof HTMLInputElement && target.type === 'hidden',
        }
      }, targetId)

      expect(state.activeId).toBe(targetId)
      expect(state.describedBy?.split(/\s+/)).toContain(`${targetId}-error`)
      expect(state.errorText).toBeTruthy()
      expect(state.hidden).toBe(false)
    } finally {
      await page.close()
    }
  })
})
