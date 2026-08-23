'use client'

import { useRef, useState } from 'react'
import { CheckCircle2, Loader2, Save, Send, ShieldCheck } from 'lucide-react'
import { saveTrainerApplicationDraft, submitTrainerApplication } from '@/app/actions/trainerApplications'
import { validateTrainerApplication } from '@/lib/coaching/applicationValidation'
import {
  optionsWithCurrentValues,
  TRAINER_LANGUAGE_OPTIONS,
  TRAINER_SPECIALTY_OPTIONS,
  trainerTimezoneOptions,
  type TrainerApplicationOption,
} from '@/lib/coaching/applicationOptions'
import type { TrainerApplicationStatus } from '@/lib/coaching/status'
import { CredentialFields, type TrainerCredentialView } from './CredentialFields'

export type TrainerApplicationView = {
  id: string
  status: TrainerApplicationStatus
  professionalName: string
  professionalPhotoUrl: string | null
  bio: string
  specialties: string[]
  modalities: Array<'online' | 'in_person' | 'hybrid'>
  experienceSummary: string
  generalLocation: string | null
  languages: string[]
  contactEmail: string
  contactPhone: string | null
  preferredContact: 'email' | 'phone' | 'whatsapp'
  timezone: string
  interviewAvailability: string
}

type FieldErrors = Record<string, string>
type DraftActionResult =
  | { ok: true; applicationId: string; status: TrainerApplicationStatus; transitioned?: boolean }
  | { ok: false; error: string; fieldErrors?: FieldErrors }
type DraftAction = (formData: FormData) => Promise<DraftActionResult>
type ReviewResult = {
  phase: 'editing' | 'confirming'
  fieldErrors: FieldErrors
  focusField: string | null
}
type ContactSummary = {
  email: string
  phone: string
  preferredContact: string
  timezone: string
}

const EMPTY_APPLICATION: Omit<TrainerApplicationView, 'id' | 'status'> = {
  professionalName: '',
  professionalPhotoUrl: null,
  bio: '',
  specialties: [],
  modalities: [],
  experienceSummary: '',
  generalLocation: null,
  languages: [],
  contactEmail: '',
  contactPhone: null,
  preferredContact: 'email',
  timezone: 'UTC',
  interviewAvailability: '',
}
const STATUS_LABELS: Record<TrainerApplicationStatus, string> = {
  draft: 'Borrador',
  submitted: 'Enviada',
  under_review: 'En revisión',
  changes_requested: 'Cambios solicitados',
  interview_required: 'Entrevista requerida',
  approved: 'Aprobada',
  rejected: 'No aprobada',
  withdrawn: 'Retirada',
}

export function prepareTrainerApplicationReview(
  input: FormData,
  options: { allowedPhotoUrls: readonly string[]; credentialCount: number },
): ReviewResult {
  const validation = validateTrainerApplication(input, {
    mode: 'submit',
    allowedPhotoUrls: options.allowedPhotoUrls,
    credentialCount: options.credentialCount,
  })
  if (validation.ok) return { phase: 'confirming', fieldErrors: {}, focusField: null }
  const fieldErrors = validation.fieldErrors ?? {}
  return {
    phase: 'editing',
    fieldErrors,
    focusField: Object.keys(fieldErrors)[0] ?? null,
  }
}

export function buildTrainerContactSummary(input: FormData): ContactSummary {
  const value = (name: string) => {
    const field = input.get(name)
    return typeof field === 'string' ? field.trim() : ''
  }
  return {
    email: value('contactEmail'),
    phone: value('contactPhone'),
    preferredContact: value('preferredContact'),
    timezone: value('timezone'),
  }
}

export async function persistTrainerApplicationDraft(
  input: FormData,
  save: DraftAction = saveTrainerApplicationDraft,
) {
  try {
    const result = await save(input)
    return result.ok
      ? { ...result, announcement: 'Borrador guardado.' as const }
      : { ...result, announcement: result.error }
  } catch {
    return { ok: false as const, error: 'No se pudo guardar el borrador.', announcement: 'No se pudo guardar el borrador.' }
  }
}

function FieldError({ name, error }: { name: string; error?: string }) {
  return error ? <p id={`${name}-error`} role="alert" className="mt-1 text-sm text-red-300">{error}</p> : null
}

function describedBy(name: string, error?: string) {
  return error ? `${name}-error` : undefined
}

function MultiSelectField({
  name,
  label,
  hint,
  options,
  selectedValues,
  error,
}: {
  name: 'specialties' | 'languages'
  label: string
  hint: string
  options: readonly TrainerApplicationOption[]
  selectedValues: readonly string[]
  error?: string
}) {
  const describedByIds = `${name}-hint${error ? ` ${name}-error` : ''}`
  return (
    <fieldset
      id={name}
      tabIndex={-1}
      aria-invalid={Boolean(error)}
      aria-describedby={describedByIds}
      className="rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400"
    >
      <legend className="text-sm font-semibold text-foreground">{label}</legend>
      <p id={`${name}-hint`} className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {optionsWithCurrentValues(options, selectedValues).map(option => (
          <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/70 px-3 text-sm font-normal">
            <input
              type="checkbox"
              name={name}
              value={option.value}
              defaultChecked={selectedValues.includes(option.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={describedByIds}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <FieldError name={name} error={error} />
    </fieldset>
  )
}

export function ApplicationForm({
  initialApplication,
  initialValues,
  initialCredentials,
  allowedPhotoUrls,
}: {
  initialApplication: TrainerApplicationView | null
  initialValues?: Partial<Omit<TrainerApplicationView, 'id' | 'status'>>
  initialCredentials: TrainerCredentialView[]
  allowedPhotoUrls: string[]
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const values = { ...EMPTY_APPLICATION, ...initialValues, ...initialApplication }
  const [applicationId, setApplicationId] = useState(initialApplication?.id ?? null)
  const [status, setStatus] = useState<TrainerApplicationStatus>(initialApplication?.status ?? 'draft')
  const [credentialCount, setCredentialCount] = useState(initialCredentials.length)
  const [contactSummary, setContactSummary] = useState<ContactSummary>({
    email: values.contactEmail,
    phone: values.contactPhone ?? '',
    preferredContact: values.preferredContact,
    timezone: values.timezone,
  })
  const [phase, setPhase] = useState<'editing' | 'confirming' | 'sent'>('editing')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [announcement, setAnnouncement] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [credentialMutating, setCredentialMutating] = useState(false)
  const editable = status === 'draft' || status === 'changes_requested'

  function focusField(name: string | null) {
    if (!name || typeof document === 'undefined') return
    requestAnimationFrame(() => document.getElementById(name)?.focus())
  }

  async function saveDraft(formData?: FormData): Promise<DraftActionResult | null> {
    if (!formRef.current || saving || credentialMutating) return null
    const draftFormData = formData ?? new FormData(formRef.current)
    setSaving(true)
    const result = await persistTrainerApplicationDraft(draftFormData)
    setSaving(false)
    setAnnouncement(result.announcement)
    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {})
      focusField(Object.keys(result.fieldErrors ?? {})[0] ?? null)
      return result
    }
    setApplicationId(result.applicationId)
    setStatus(result.status)
    setFieldErrors({})
    return result
  }

  async function reviewApplication() {
    if (!formRef.current) return
    const currentFormData = new FormData(formRef.current)
    const saved = await saveDraft(currentFormData)
    if (!saved?.ok) return

    const review = prepareTrainerApplicationReview(currentFormData, {
      allowedPhotoUrls,
      credentialCount,
    })
    setFieldErrors(review.fieldErrors)
    setPhase(review.phase)
    if (review.phase === 'editing') {
      setAnnouncement('Revisa los campos señalados antes de enviar.')
      focusField(review.focusField)
      return
    }

    setContactSummary(buildTrainerContactSummary(currentFormData))
  }

  async function confirmSubmission() {
    if (!applicationId || submitting || credentialMutating) return
    setSubmitting(true)
    const formData = new FormData()
    formData.set('applicationId', applicationId)
    try {
      const result = await submitTrainerApplication(formData)
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {})
        setAnnouncement(result.error)
        setPhase('editing')
        return
      }
      setStatus(result.status)
      setPhase('sent')
      setAnnouncement('Solicitud enviada para revisión.')
    } catch {
      setAnnouncement('No se pudo enviar la solicitud.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <form ref={formRef} onSubmit={event => event.preventDefault()} noValidate className="rounded-3xl border border-border/60 bg-muted/10 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Tu perfil profesional</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Puedes guardar y continuar más tarde.</p>
          </div>
          <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-semibold text-muted-foreground">
            {STATUS_LABELS[status]}
          </span>
        </div>

        <fieldset disabled={!editable || saving || submitting || credentialMutating || phase === 'confirming'} className="mt-6 space-y-6">
          <input type="hidden" name="professionalPhotoUrl" value={values.professionalPhotoUrl ?? ''} />
          <div
            id="professionalPhotoUrl"
            role="group"
            tabIndex={-1}
            aria-labelledby="professional-photo-title"
            aria-invalid={Boolean(fieldErrors.professionalPhotoUrl)}
            aria-describedby={describedBy('professionalPhotoUrl', fieldErrors.professionalPhotoUrl)}
            className="rounded-2xl border border-border/60 bg-background/40 p-4 focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            <div id="professional-photo-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" /> Foto profesional
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {values.professionalPhotoUrl ? 'Usaremos la foto de tu perfil actual.' : 'Añade una foto en tu perfil antes de enviar.'}
            </p>
            <FieldError name="professionalPhotoUrl" error={fieldErrors.professionalPhotoUrl} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label htmlFor="professionalName" className="text-sm font-semibold text-foreground">
              Nombre profesional
              <input id="professionalName" name="professionalName" defaultValue={values.professionalName} autoComplete="name" aria-invalid={Boolean(fieldErrors.professionalName)} aria-describedby={describedBy('professionalName', fieldErrors.professionalName)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
              <FieldError name="professionalName" error={fieldErrors.professionalName} />
            </label>
            <label htmlFor="generalLocation" className="text-sm font-semibold text-foreground">
              Ubicación general
              <input id="generalLocation" name="generalLocation" defaultValue={values.generalLocation ?? ''} autoComplete="address-level2" aria-invalid={Boolean(fieldErrors.generalLocation)} aria-describedby={describedBy('generalLocation', fieldErrors.generalLocation)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
              <FieldError name="generalLocation" error={fieldErrors.generalLocation} />
            </label>
          </div>

          <label htmlFor="bio" className="block text-sm font-semibold text-foreground">
            Biografía profesional
            <textarea id="bio" name="bio" defaultValue={values.bio} rows={5} maxLength={2000} aria-invalid={Boolean(fieldErrors.bio)} aria-describedby={describedBy('bio', fieldErrors.bio)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal" />
            <FieldError name="bio" error={fieldErrors.bio} />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <MultiSelectField
              name="specialties"
              label="Especialidades"
              hint="Selecciona una o varias áreas."
              options={TRAINER_SPECIALTY_OPTIONS}
              selectedValues={values.specialties}
              error={fieldErrors.specialties}
            />
            <MultiSelectField
              name="languages"
              label="Idiomas"
              hint="Selecciona todos los idiomas en los que puedes atender."
              options={TRAINER_LANGUAGE_OPTIONS}
              selectedValues={values.languages}
              error={fieldErrors.languages}
            />
          </div>

          <fieldset
            id="modalities"
            tabIndex={-1}
            aria-invalid={Boolean(fieldErrors.modalities)}
            aria-describedby={describedBy('modalities', fieldErrors.modalities)}
            className="rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400"
          >
            <legend className="text-sm font-semibold text-foreground">Modalidades</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {([
                ['online', 'En línea'],
                ['in_person', 'Presencial'],
                ['hybrid', 'Híbrida'],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/70 px-3 text-sm font-normal">
                  <input
                    type="checkbox"
                    name="modalities"
                    value={value}
                    defaultChecked={values.modalities.includes(value)}
                    aria-invalid={Boolean(fieldErrors.modalities)}
                    aria-describedby={describedBy('modalities', fieldErrors.modalities)}
                  /> {label}
                </label>
              ))}
            </div>
            <FieldError name="modalities" error={fieldErrors.modalities} />
          </fieldset>

          <label htmlFor="experienceSummary" className="block text-sm font-semibold text-foreground">
            Experiencia
            <textarea id="experienceSummary" name="experienceSummary" defaultValue={values.experienceSummary} rows={4} maxLength={2000} aria-invalid={Boolean(fieldErrors.experienceSummary)} aria-describedby={describedBy('experienceSummary', fieldErrors.experienceSummary)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal" />
            <FieldError name="experienceSummary" error={fieldErrors.experienceSummary} />
          </label>

          <section aria-labelledby="contact-title" className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.05] p-4">
            <h3 id="contact-title" className="font-semibold text-foreground">Contacto y coordinación</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Estos datos son privados y solo se usan para coordinar la revisión y, si corresponde, la entrevista.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label htmlFor="contactEmail" className="text-sm font-semibold text-foreground">
                Correo de contacto
                <input id="contactEmail" name="contactEmail" type="email" defaultValue={values.contactEmail} autoComplete="email" aria-invalid={Boolean(fieldErrors.contactEmail)} aria-describedby={describedBy('contactEmail', fieldErrors.contactEmail)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                <FieldError name="contactEmail" error={fieldErrors.contactEmail} />
              </label>
              <label htmlFor="contactPhone" className="text-sm font-semibold text-foreground">
                Teléfono de contacto
                <input id="contactPhone" name="contactPhone" type="tel" defaultValue={values.contactPhone ?? ''} autoComplete="tel" aria-invalid={Boolean(fieldErrors.contactPhone)} aria-describedby={describedBy('contactPhone', fieldErrors.contactPhone)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                <FieldError name="contactPhone" error={fieldErrors.contactPhone} />
              </label>
              <label htmlFor="preferredContact" className="text-sm font-semibold text-foreground">
                Medio de contacto preferido
                <select id="preferredContact" name="preferredContact" defaultValue={values.preferredContact} aria-invalid={Boolean(fieldErrors.preferredContact)} aria-describedby={describedBy('preferredContact', fieldErrors.preferredContact)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal">
                  <option value="email">Correo</option>
                  <option value="phone">Teléfono</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
                <FieldError name="preferredContact" error={fieldErrors.preferredContact} />
              </label>
              <div className="text-sm font-semibold text-foreground">
                <label htmlFor="timezone">Zona horaria</label>
                <select id="timezone" name="timezone" defaultValue={values.timezone} aria-invalid={Boolean(fieldErrors.timezone)} aria-describedby={describedBy('timezone', fieldErrors.timezone)} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal">
                  {trainerTimezoneOptions(values.timezone).map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <FieldError name="timezone" error={fieldErrors.timezone} />
              </div>
            </div>
            <label htmlFor="interviewAvailability" className="mt-4 block text-sm font-semibold text-foreground">
              Disponibilidad para entrevista
              <textarea id="interviewAvailability" name="interviewAvailability" defaultValue={values.interviewAvailability} rows={3} maxLength={1000} aria-invalid={Boolean(fieldErrors.interviewAvailability)} aria-describedby={describedBy('interviewAvailability', fieldErrors.interviewAvailability)} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal" />
              <FieldError name="interviewAvailability" error={fieldErrors.interviewAvailability} />
            </label>
          </section>
        </fieldset>

        {editable && phase === 'editing' ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => void saveDraft()} disabled={saving || submitting || credentialMutating} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {saving ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button type="button" onClick={() => void reviewApplication()} disabled={saving || submitting || credentialMutating} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50">
              <Send className="h-4 w-4" aria-hidden="true" /> Revisar y enviar
            </button>
          </div>
        ) : null}
        {announcement && phase !== 'sent' ? (
          <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-sm text-muted-foreground">
            {announcement}
          </p>
        ) : null}
      </form>

      <FieldError name="credentials" error={fieldErrors.credentials} />
      <CredentialFields
        applicationId={applicationId}
        status={status}
        initialCredentials={initialCredentials}
        disabled={saving || submitting || credentialMutating || phase !== 'editing'}
        focusTargetId="credentials"
        errorId={describedBy('credentials', fieldErrors.credentials)}
        invalid={Boolean(fieldErrors.credentials)}
        onSaveDraft={async () => {
          const saved = await saveDraft()
          return saved?.ok ? saved.applicationId : null
        }}
        onMutationChange={setCredentialMutating}
        onCountChange={count => {
          setCredentialCount(count)
          if (count > 0) {
            setFieldErrors(current => {
              const { credentials: _credentials, ...remaining } = current
              return remaining
            })
          }
        }}
      />

      {phase === 'confirming' ? (
        <section aria-labelledby="application-confirm-title" className="rounded-3xl border border-violet-500/40 bg-background p-5 shadow-2xl sm:p-6">
          <CheckCircle2 className="h-7 w-7 text-emerald-300" aria-hidden="true" />
          <h2 id="application-confirm-title" className="mt-3 text-xl font-bold text-foreground">Confirma el envío</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Revisa tu resumen de contacto. Después de enviar, solo podrás editar si el equipo solicita cambios.</p>
          <dl className="mt-4 grid gap-3 rounded-2xl bg-muted/20 p-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Correo</dt><dd className="font-semibold text-foreground">{contactSummary.email}</dd></div>
            <div><dt className="text-muted-foreground">Teléfono</dt><dd className="font-semibold text-foreground">{contactSummary.phone || 'No suministrado'}</dd></div>
            <div><dt className="text-muted-foreground">Medio preferido</dt><dd className="font-semibold text-foreground">{contactSummary.preferredContact}</dd></div>
            <div><dt className="text-muted-foreground">Zona horaria</dt><dd className="font-semibold text-foreground">{contactSummary.timezone}</dd></div>
          </dl>
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setPhase('editing')} disabled={submitting} className="min-h-11 rounded-xl border border-border/70 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Volver a editar</button>
            <button type="button" onClick={() => void confirmSubmission()} disabled={!applicationId || submitting || credentialMutating} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {submitting ? 'Enviando…' : 'Confirmar y enviar'}
            </button>
          </div>
        </section>
      ) : null}

      {phase === 'sent' ? (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] p-4 text-sm text-emerald-200">
          Solicitud enviada. Puedes seguir aquí cualquier cambio de estado.
        </div>
      ) : null}
    </div>
  )
}
