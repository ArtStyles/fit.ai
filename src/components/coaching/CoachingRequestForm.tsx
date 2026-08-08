'use client'

import { useState } from 'react'
import { createCoachingRequest } from '@/app/actions/coachingRequests'
import { TRAINING_PROFILE_CONSENT_TEXT, TRAINING_PROFILE_CONSENT_VERSION } from '@/lib/coaching/requestValidation'

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const hex = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(32, '0').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4000-8000-${hex.slice(12, 24)}`
}

export function CoachingRequestForm({ service }: { service: { id: string; name: string } }) {
  const [pending, setPending] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey)

  async function submit(formData: FormData) {
    if (pending) return
    setPending(true)
    setFieldErrors({})
    const result = await createCoachingRequest(formData)
    setPending(false)
    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {})
      setAnnouncement(result.error)
      return
    }
    setAnnouncement(result.created ? 'Tu solicitud quedó pendiente de respuesta.' : 'Tu solicitud ya estaba registrada.')
    setIdempotencyKey(newIdempotencyKey())
  }

  return (
    <form action={submit} className="mt-4 rounded-2xl border border-violet-500/30 bg-violet-500/[0.04] p-4" noValidate>
      <input type="hidden" name="serviceId" value={service.id} />
      <input type="hidden" name="consentVersion" value={TRAINING_PROFILE_CONSENT_VERSION} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <h4 className="font-semibold text-foreground">Solicitar acompañamiento</h4>
      <p className="mt-1 text-sm text-muted-foreground">Solicitud para {service.name}. No abre un canal de contacto directo.</p>
      <label htmlFor={`request-message-${service.id}`} className="mt-4 block text-sm font-medium text-foreground">
        Mensaje opcional
        <textarea id={`request-message-${service.id}`} name="message" rows={3} maxLength={1000} aria-describedby={fieldErrors.message ? `request-message-${service.id}-error` : undefined} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 font-normal" />
      </label>
      {fieldErrors.message ? <p id={`request-message-${service.id}-error`} role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.message}</p> : null}
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-border/70 bg-background/50 p-3 text-sm text-foreground">
        <input type="checkbox" name="consentAccepted" value="true" className="mt-1" aria-describedby="training-profile-consent-description" />
        <span id="training-profile-consent-description">{TRAINING_PROFILE_CONSENT_TEXT}</span>
      </label>
      {fieldErrors.consentAccepted || fieldErrors.consentVersion ? <p role="alert" className="mt-1 text-sm text-red-600">{fieldErrors.consentAccepted ?? fieldErrors.consentVersion}</p> : null}
      <button type="submit" disabled={pending} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50">
        {pending ? 'Enviando…' : 'Enviar solicitud'}
      </button>
      <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">{announcement}</p>
    </form>
  )
}
