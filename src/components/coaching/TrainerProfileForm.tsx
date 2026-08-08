'use client'

import { useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { updateTrainerProfile } from '@/app/actions/trainerProfile'

export type TrainerProfileFormValue = {
  professionalName: string
  professionalPhotoUrl: string | null
  bio: string
  specialties: string[]
  modalities: Array<'online' | 'in_person' | 'hybrid'>
  experienceSummary: string
  generalLocation: string | null
  languages: string[]
}

export type PendingTrainerProfileReview = Pick<
  TrainerProfileFormValue,
  'professionalName' | 'specialties' | 'modalities' | 'experienceSummary'
> & {
  id: string
  status: 'draft' | 'submitted' | 'under_review' | 'changes_requested' | 'interview_required'
}

type ProfileActionResult =
  | {
      ok: true
      directUpdated: boolean
      reviewApplicationId: string | null
      reviewStatus: PendingTrainerProfileReview['status'] | null
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }
type ProfileAction = (formData: FormData) => Promise<ProfileActionResult>

const REVIEW_STATUS_LABELS: Record<PendingTrainerProfileReview['status'], string> = {
  draft: 'Borrador',
  submitted: 'Enviada',
  under_review: 'En revisión',
  changes_requested: 'Cambios solicitados',
  interview_required: 'Entrevista requerida',
}

export async function persistTrainerProfileChanges(
  formData: FormData,
  save: ProfileAction = updateTrainerProfile,
) {
  try {
    const result = await save(formData)
    if (!result.ok) return { ...result, announcement: result.error }
    return {
      ...result,
      announcement: result.reviewApplicationId
        ? 'Perfil actualizado. Los cambios profesionales están pendientes de revisión.'
        : 'Perfil profesional actualizado.',
    }
  } catch {
    return {
      ok: false as const,
      error: 'No se pudo guardar el perfil profesional.',
      announcement: 'No se pudo guardar el perfil profesional.',
    }
  }
}

function FieldError({ name, error }: { name: string; error?: string }) {
  return error ? <p id={`${name}-error`} role="alert" className="mt-1 text-sm text-red-300">{error}</p> : null
}

function describedBy(name: string, error?: string) {
  return error ? `${name}-error` : undefined
}

export function TrainerProfileForm({
  approvedProfile,
  pendingReview,
}: {
  approvedProfile: TrainerProfileFormValue
  pendingReview: PendingTrainerProfileReview | null
}) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [announcement, setAnnouncement] = useState('')
  const [saving, setSaving] = useState(false)
  const reviewLocked = pendingReview?.status === 'under_review'
    || pendingReview?.status === 'interview_required'
  const reviewValues = pendingReview && !reviewLocked ? pendingReview : approvedProfile

  async function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const result = await persistTrainerProfileChanges(new FormData(event.currentTarget))
    setSaving(false)
    setAnnouncement(result.announcement)
    setFieldErrors(result.ok ? {} : result.fieldErrors ?? {})
  }

  return (
    <div className="space-y-6">
      {pendingReview ? (
        <section aria-labelledby="pending-review-title" className="rounded-3xl border border-amber-500/30 bg-amber-500/[0.06] p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="pending-review-title" className="font-bold text-foreground">Cambios profesionales pendientes</h2>
            <span className="rounded-full border border-amber-500/30 px-3 py-1 text-xs font-semibold text-amber-200">
              {REVIEW_STATUS_LABELS[pendingReview.status]}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Tu perfil aprobado sigue visible sin estos cambios hasta la decisión administrativa.</p>
          <div className="mt-4 rounded-2xl border border-border/60 bg-background/40 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Versión aprobada actual</p>
            <p className="mt-1 font-semibold text-foreground">{approvedProfile.professionalName}</p>
            <p className="mt-1 text-muted-foreground">{approvedProfile.specialties.join(', ')} · {approvedProfile.modalities.join(', ')}</p>
          </div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Nombre propuesto</dt><dd className="font-semibold text-foreground">{pendingReview.professionalName}</dd></div>
            <div><dt className="text-muted-foreground">Especialidades propuestas</dt><dd className="font-semibold text-foreground">{pendingReview.specialties.join(', ')}</dd></div>
            <div><dt className="text-muted-foreground">Modalidades propuestas</dt><dd className="font-semibold text-foreground">{pendingReview.modalities.join(', ')}</dd></div>
            <div><dt className="text-muted-foreground">Experiencia propuesta</dt><dd className="font-semibold text-foreground">{pendingReview.experienceSummary}</dd></div>
          </dl>
        </section>
      ) : null}

      <form onSubmit={event => void submitProfile(event)} noValidate className="space-y-6">
        {reviewLocked ? (
          <>
            <input type="hidden" name="professionalName" value={approvedProfile.professionalName} />
            <input type="hidden" name="specialties" value={approvedProfile.specialties.join(', ')} />
            {approvedProfile.modalities.map(modality => <input key={modality} type="hidden" name="modalities" value={modality} />)}
            <input type="hidden" name="experienceSummary" value={approvedProfile.experienceSummary} />
          </>
        ) : null}
        <section className="rounded-3xl border border-emerald-500/20 bg-muted/10 p-5 sm:p-6">
          <h2 className="text-lg font-bold text-foreground">Se actualizan al guardar</h2>
          <p className="mt-1 text-sm text-muted-foreground">Estos datos no necesitan una nueva decisión administrativa.</p>
          <div className="mt-5 space-y-5">
            <label htmlFor="professionalPhotoUrl" className="block text-sm font-semibold text-foreground">
              Foto profesional
              <input id="professionalPhotoUrl" name="professionalPhotoUrl" type="url" defaultValue={approvedProfile.professionalPhotoUrl ?? ''} placeholder="https://…" aria-invalid={Boolean(fieldErrors.professionalPhotoUrl)} aria-describedby={describedBy('professionalPhotoUrl', fieldErrors.professionalPhotoUrl)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
              <FieldError name="professionalPhotoUrl" error={fieldErrors.professionalPhotoUrl} />
            </label>
            <label htmlFor="bio" className="block text-sm font-semibold text-foreground">
              Biografía
              <textarea id="bio" name="bio" rows={5} maxLength={2000} defaultValue={approvedProfile.bio} aria-invalid={Boolean(fieldErrors.bio)} aria-describedby={describedBy('bio', fieldErrors.bio)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal" />
              <FieldError name="bio" error={fieldErrors.bio} />
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label htmlFor="generalLocation" className="text-sm font-semibold text-foreground">
                Ubicación general
                <input id="generalLocation" name="generalLocation" defaultValue={approvedProfile.generalLocation ?? ''} aria-invalid={Boolean(fieldErrors.generalLocation)} aria-describedby={describedBy('generalLocation', fieldErrors.generalLocation)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                <FieldError name="generalLocation" error={fieldErrors.generalLocation} />
              </label>
              <label htmlFor="languages" className="text-sm font-semibold text-foreground">
                Idiomas
                <input id="languages" name="languages" defaultValue={approvedProfile.languages.join(', ')} aria-invalid={Boolean(fieldErrors.languages)} aria-describedby={describedBy('languages', fieldErrors.languages)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                <FieldError name="languages" error={fieldErrors.languages} />
              </label>
            </div>
          </div>
        </section>

        <fieldset disabled={reviewLocked || saving} className="rounded-3xl border border-violet-500/25 bg-muted/10 p-5 disabled:opacity-70 sm:p-6">
          <legend className="px-1 text-lg font-bold text-foreground">Requieren revisión</legend>
          <p className="mt-1 text-sm text-muted-foreground">El nombre, especialidades, modalidades y experiencia sólo cambian tras una nueva aprobación.</p>
          <div className="mt-5 space-y-5">
            <label htmlFor="professionalName" className="block text-sm font-semibold text-foreground">
              Nombre profesional
              <input id="professionalName" name="professionalName" defaultValue={reviewValues.professionalName} aria-invalid={Boolean(fieldErrors.professionalName)} aria-describedby={describedBy('professionalName', fieldErrors.professionalName)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
              <FieldError name="professionalName" error={fieldErrors.professionalName} />
            </label>
            <label htmlFor="specialties" className="block text-sm font-semibold text-foreground">
              Especialidades
              <input id="specialties" name="specialties" defaultValue={reviewValues.specialties.join(', ')} aria-invalid={Boolean(fieldErrors.specialties)} aria-describedby={describedBy('specialties', fieldErrors.specialties)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
              <FieldError name="specialties" error={fieldErrors.specialties} />
            </label>
            <fieldset id="modalities" aria-describedby={describedBy('modalities', fieldErrors.modalities)}>
              <legend className="text-sm font-semibold text-foreground">Modalidades</legend>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                {([
                  ['online', 'En línea'],
                  ['in_person', 'Presencial'],
                  ['hybrid', 'Híbrida'],
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex min-h-11 items-center gap-2 rounded-xl border border-border/70 px-3 text-sm">
                    <input type="checkbox" name="modalities" value={value} defaultChecked={reviewValues.modalities.includes(value)} /> {label}
                  </label>
                ))}
              </div>
              <FieldError name="modalities" error={fieldErrors.modalities} />
            </fieldset>
            <label htmlFor="experienceSummary" className="block text-sm font-semibold text-foreground">
              Experiencia
              <textarea id="experienceSummary" name="experienceSummary" rows={4} maxLength={2000} defaultValue={reviewValues.experienceSummary} aria-invalid={Boolean(fieldErrors.experienceSummary)} aria-describedby={describedBy('experienceSummary', fieldErrors.experienceSummary)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal" />
              <FieldError name="experienceSummary" error={fieldErrors.experienceSummary} />
            </label>
          </div>
        </fieldset>

        <button type="submit" disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {saving ? 'Guardando…' : 'Guardar perfil'}
        </button>
      </form>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  )
}
