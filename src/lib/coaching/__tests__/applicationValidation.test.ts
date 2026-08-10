import { describe, expect, it } from 'vitest'
import {
  MAX_TRAINER_CREDENTIAL_BYTES,
  validateTrainerApplication,
  validateTrainerCredential,
} from '../applicationValidation'

function completeApplication(overrides: Record<string, string | string[]> = {}): FormData {
  const values: Record<string, string | string[]> = {
    professionalName: 'Alex Entrenador',
    professionalPhotoUrl: 'https://cdn.example.test/avatar/user-1.jpg',
    bio: 'Entrenador certificado con experiencia en fuerza, movilidad y trabajo progresivo.',
    specialties: ['Fuerza', 'Movilidad'],
    modalities: ['online', 'in_person'],
    experienceSummary: 'Cinco anos acompanando procesos de entrenamiento individual.',
    generalLocation: 'La Habana, Cuba',
    languages: ['es', 'en'],
    contactEmail: 'alex@example.test',
    contactPhone: '+53 5555 0101',
    preferredContact: 'whatsapp',
    timezone: 'America/Havana',
    interviewAvailability: 'Lunes y miercoles de 14:00 a 18:00.',
    ...overrides,
  }
  const formData = new FormData()
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) formData.append(key, item)
  }
  return formData
}

describe('trainer application validation', () => {
  it('normalizes a complete application without accepting unowned photos', () => {
    const result = validateTrainerApplication(completeApplication(), {
      mode: 'submit',
      allowedPhotoUrls: ['https://cdn.example.test/avatar/user-1.jpg'],
      credentialCount: 1,
    })

    expect(result).toEqual({
      ok: true,
      value: {
        professionalName: 'Alex Entrenador',
        professionalPhotoUrl: 'https://cdn.example.test/avatar/user-1.jpg',
        bio: 'Entrenador certificado con experiencia en fuerza, movilidad y trabajo progresivo.',
        specialties: ['Fuerza', 'Movilidad'],
        modalities: ['online', 'in_person'],
        experienceSummary: 'Cinco anos acompanando procesos de entrenamiento individual.',
        generalLocation: 'La Habana, Cuba',
        languages: ['es', 'en'],
        contactEmail: 'alex@example.test',
        contactPhone: '+53 5555 0101',
        preferredContact: 'whatsapp',
        timezone: 'America/Havana',
        interviewAvailability: 'Lunes y miercoles de 14:00 a 18:00.',
      },
    })

    const unowned = validateTrainerApplication(completeApplication({
      professionalPhotoUrl: 'https://malicious.example/photo.jpg',
    }), {
      mode: 'submit',
      allowedPhotoUrls: ['https://cdn.example.test/avatar/user-1.jpg'],
      credentialCount: 1,
    })
    expect(unowned).toMatchObject({ ok: false, fieldErrors: { professionalPhotoUrl: expect.any(String) } })
  })

  it.each([
    ['professionalName', 'A', 'professionalName'],
    ['professionalName', 'A'.repeat(101), 'professionalName'],
    ['bio', 'breve', 'bio'],
    ['bio', 'A'.repeat(2001), 'bio'],
    ['experienceSummary', 'breve', 'experienceSummary'],
    ['experienceSummary', 'A'.repeat(2001), 'experienceSummary'],
    ['generalLocation', 'A'.repeat(121), 'generalLocation'],
    ['interviewAvailability', 'corto', 'interviewAvailability'],
    ['interviewAvailability', 'A'.repeat(1001), 'interviewAvailability'],
  ])('rejects an invalid %s length at submission', (key, value, errorKey) => {
    const result = validateTrainerApplication(completeApplication({ [key]: value }), {
      mode: 'submit',
      allowedPhotoUrls: ['https://cdn.example.test/avatar/user-1.jpg'],
      credentialCount: 1,
    })
    expect(result).toMatchObject({ ok: false, fieldErrors: { [errorKey]: expect.any(String) } })
  })

  it('allows incomplete drafts but enforces safe formats and maximum lengths', () => {
    const emptyDraft = validateTrainerApplication(new FormData(), { mode: 'draft' })
    expect(emptyDraft).toMatchObject({ ok: true })

    const invalid = completeApplication({
      contactEmail: 'not-an-email',
      contactPhone: 'call me maybe',
      timezone: 'Havana',
      specialties: Array.from({ length: 11 }, (_, index) => `Area ${index}`),
      languages: [],
      modalities: ['remote'],
    })
    const result = validateTrainerApplication(invalid, { mode: 'draft' })
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        contactEmail: expect.any(String),
        contactPhone: expect.any(String),
        timezone: expect.any(String),
        specialties: expect.any(String),
        modalities: expect.any(String),
      },
    })

    const unknownCredentialCount = validateTrainerApplication(completeApplication(), {
      mode: 'submit',
      allowedPhotoUrls: ['https://cdn.example.test/avatar/user-1.jpg'],
    })
    expect(unknownCredentialCount).toMatchObject({
      ok: false,
      fieldErrors: { credentials: expect.any(String) },
    })
  })

  it('requires all profile fields and at least one credential at submission', () => {
    const result = validateTrainerApplication(completeApplication({
      professionalPhotoUrl: '',
      specialties: [],
      modalities: [],
      languages: [],
      generalLocation: '',
    }), {
      mode: 'submit',
      allowedPhotoUrls: ['https://cdn.example.test/avatar/user-1.jpg'],
      credentialCount: 0,
    })

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        professionalPhotoUrl: expect.any(String),
        specialties: expect.any(String),
        modalities: expect.any(String),
        languages: expect.any(String),
        credentials: expect.any(String),
      },
    })
  })

  it('requires a phone when phone or WhatsApp is the preferred contact', () => {
    const result = validateTrainerApplication(completeApplication({ contactPhone: '' }), {
      mode: 'submit',
      allowedPhotoUrls: ['https://cdn.example.test/avatar/user-1.jpg'],
      credentialCount: 1,
    })
    expect(result).toMatchObject({ ok: false, fieldErrors: { contactPhone: expect.any(String) } })
  })

  it('allows an online-only trainer to omit a general location', () => {
    const result = validateTrainerApplication(completeApplication({
      modalities: ['online'],
      generalLocation: '',
    }), {
      mode: 'submit',
      allowedPhotoUrls: ['https://cdn.example.test/avatar/user-1.jpg'],
      credentialCount: 1,
    })
    expect(result).toMatchObject({ ok: true, value: { generalLocation: null } })
  })

  it.each(['government_id', 'identity_document', 'passport'])('explicitly rejects forbidden identity field %s', key => {
    const formData = completeApplication()
    formData.set(key, 'sensitive-value')
    const result = validateTrainerApplication(formData, { mode: 'draft' })
    expect(result).toEqual({ ok: false, error: 'La solicitud contiene campos de identidad no permitidos.' })
  })
})

describe('trainer credential validation', () => {
  it('accepts only normalized HTTPS links', () => {
    expect(validateTrainerCredential({
      credentialType: 'link',
      title: 'Certificacion oficial',
      externalUrl: '  https://issuer.example/cert/123  ',
    })).toMatchObject({ ok: true, value: { externalUrl: 'https://issuer.example/cert/123' } })

    expect(validateTrainerCredential({
      credentialType: 'link',
      title: 'Certificacion oficial',
      externalUrl: 'http://issuer.example/cert/123',
    })).toMatchObject({ ok: false, fieldErrors: { externalUrl: expect.any(String) } })
  })

  it.each(['application/pdf', 'image/jpeg', 'image/png'])('accepts %s documents up to 10 MB', mimeType => {
    const result = validateTrainerCredential({
      credentialType: 'document',
      title: 'Certificacion oficial',
      file: new File([new Uint8Array(16)], 'credential.bin', { type: mimeType }),
    })
    expect(result).toMatchObject({ ok: true })
  })

  it('rejects unsupported, empty and oversized documents', () => {
    expect(validateTrainerCredential({
      credentialType: 'document',
      title: 'Certificacion oficial',
      file: new File(['plain'], 'credential.txt', { type: 'text/plain' }),
    })).toMatchObject({ ok: false, fieldErrors: { file: expect.any(String) } })

    expect(validateTrainerCredential({
      credentialType: 'document',
      title: 'Certificacion oficial',
      file: new File([], 'empty.pdf', { type: 'application/pdf' }),
    })).toMatchObject({ ok: false, fieldErrors: { file: expect.any(String) } })

    const oversized = new File(
      [new Uint8Array(MAX_TRAINER_CREDENTIAL_BYTES + 1)],
      'oversized.pdf',
      { type: 'application/pdf' },
    )
    expect(validateTrainerCredential({
      credentialType: 'document',
      title: 'Certificacion oficial',
      file: oversized,
    })).toMatchObject({ ok: false, fieldErrors: { file: expect.any(String) } })
  })
})
