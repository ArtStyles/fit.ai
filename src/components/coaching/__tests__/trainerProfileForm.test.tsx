import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions/trainerProfile', () => ({
  updateTrainerProfile: vi.fn(),
}))
import {
  TrainerProfileForm,
  persistTrainerProfileChanges,
  type TrainerProfileFormValue,
} from '../TrainerProfileForm'

const APPROVED: TrainerProfileFormValue = {
  professionalName: 'Ada Aprobada',
  professionalPhotoUrl: 'https://cdn.example.test/ada.jpg',
  bio: 'Entrenadora de fuerza con un enfoque progresivo, seguro y adaptado a cada persona.',
  specialties: ['Fuerza'],
  modalities: ['online'],
  experienceSummary: 'Ocho anos de experiencia profesional aprobada.',
  generalLocation: 'La Habana',
  languages: ['Espanol'],
}

describe('TrainerProfileForm', () => {
  it('separates direct fields from fields that require administrative review', () => {
    const html = renderToStaticMarkup(
      <TrainerProfileForm approvedProfile={APPROVED} pendingReview={null} />,
    )

    expect(html).toContain('Se actualizan al guardar')
    expect(html).toContain('Biografía')
    expect(html).toContain('Foto profesional')
    expect(html).toContain('Ubicación general')
    expect(html).toContain('Idiomas')
    expect(html).toContain('Requieren revisión')
    expect(html).toContain('Nombre profesional')
    expect(html).toContain('Especialidades')
    expect(html).toContain('Modalidades')
    expect(html).toContain('Experiencia')
  })

  it('keeps approved sensitive values in the form while showing a pending proposal separately', () => {
    const html = renderToStaticMarkup(
      <TrainerProfileForm
        approvedProfile={APPROVED}
        pendingReview={{
          id: 'review-1',
          status: 'under_review',
          professionalName: 'Ada Propuesta',
          specialties: ['Movilidad'],
          modalities: ['hybrid'],
          experienceSummary: 'Nueva experiencia pendiente de decisión administrativa.',
        }}
      />,
    )

    expect(html).toContain('Ada Aprobada')
    expect(html).toContain('Ada Propuesta')
    expect(html).toContain('En revisión')
    expect(html).toContain('Tu perfil aprobado sigue visible sin estos cambios')
    expect(html).toContain('type="hidden" name="professionalName" value="Ada Aprobada"')
    expect(html).toContain('type="hidden" name="modalities" value="online"')
  })

  it('announces direct updates and a submitted review from the action result', async () => {
    const result = await persistTrainerProfileChanges(new FormData(), async () => ({
      ok: true,
      directUpdated: true,
      reviewApplicationId: 'review-1',
      reviewStatus: 'submitted',
    }))

    expect(result).toEqual({
      ok: true,
      directUpdated: true,
      reviewApplicationId: 'review-1',
      reviewStatus: 'submitted',
      announcement: 'Perfil actualizado. Los cambios profesionales están pendientes de revisión.',
    })
  })

  it('uses the submitted proposal as the editable reviewed values when reusing a review', () => {
    const html = renderToStaticMarkup(
      <TrainerProfileForm
        approvedProfile={APPROVED}
        pendingReview={{
          id: 'review-1',
          status: 'submitted',
          professionalName: 'Ada Propuesta',
          specialties: ['Movilidad'],
          modalities: ['hybrid'],
          experienceSummary: 'Nueva experiencia pendiente de decisión administrativa.',
        }}
      />,
    )

    expect(html).toMatch(/name="professionalName"[^>]*value="Ada Propuesta"/)
    expect(html).toMatch(/name="specialties"[^>]*value="Movilidad"/)
    expect(html).toMatch(/name="modalities" checked="" value="hybrid"/)
  })

  it('preserves field errors returned by the server action', async () => {
    const result = await persistTrainerProfileChanges(new FormData(), async () => ({
      ok: false,
      error: 'Revisa los campos del perfil profesional.',
      fieldErrors: { bio: 'La biografía es demasiado corta.' },
    }))

    expect(result).toMatchObject({
      ok: false,
      announcement: 'Revisa los campos del perfil profesional.',
      fieldErrors: { bio: 'La biografía es demasiado corta.' },
    })
  })
})
