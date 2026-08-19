'use client'

import { useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { dateLocale } from '@/lib/i18n'

export type CoachingConsentView = {
  scope: 'training_profile' | 'body_measurements'
  textVersion: string
  grantedAt: string
  revokedAt: string | null
}

type ConsentAction = 'grant' | 'revoke-body' | 'revoke-training'

function nextIdempotencyKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

function ConsentStatus({ consent }: { consent?: CoachingConsentView }) {
  const { language, timeZone } = useI18n()
  if (!consent) return <p className="mt-2 text-sm text-muted-foreground">Aún no autorizaste este alcance.</p>
  const date = new Intl.DateTimeFormat(dateLocale(language), { dateStyle: 'medium', timeZone }).format(new Date(consent.grantedAt))
  return <p className="mt-2 text-sm text-muted-foreground">Versión {consent.textVersion}. Otorgado el {date}{consent.revokedAt ? '. Revocado.' : '.'}</p>
}

export function ConsentManager({ relationshipId, consents }: { relationshipId: string; consents: CoachingConsentView[] }) {
  const [busy, setBusy] = useState<ConsentAction | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: '', error: false })
  const attemptKeys = useRef(new Map<ConsentAction, string>())
  const training = consents.find(consent => consent.scope === 'training_profile')
  const body = consents.find(consent => consent.scope === 'body_measurements')
  const bodyGranted = Boolean(body && !body.revokedAt)

  async function act(action: ConsentAction) {
    const confirmation = action === 'revoke-training'
      ? '¿Revocar datos de entrenamiento y finalizar este acompañamiento?'
      : action === 'revoke-body'
        ? '¿Revocar el acceso a tus medidas corporales?'
        : '¿Autorizar compartir tus medidas corporales?'
    if (!window.confirm(confirmation)) return
    setBusy(action)
    try {
      const formData = new FormData()
      formData.set('relationshipId', relationshipId)
      const idempotencyKey = attemptKeys.current.get(action) ?? nextIdempotencyKey()
      attemptKeys.current.set(action, idempotencyKey)
      formData.set('idempotencyKey', idempotencyKey)
      const actions = await import('@/app/actions/coachingRelationships')
      const result = action === 'grant'
        ? await actions.grantBodyMeasurementsConsent(formData)
        : action === 'revoke-body'
          ? await actions.revokeBodyMeasurementsConsent(formData)
          : await actions.revokeTrainingProfileConsent(formData)
      setMessage({
        text: result.ok
          ? action === 'revoke-training' ? 'Tus datos fueron revocados y el acompañamiento finalizó.' : 'Tu consentimiento fue actualizado.'
          : result.error,
        error: !result.ok,
      })
      if (result.ok) attemptKeys.current.delete(action)
    } catch {
      setMessage({ text: 'No se pudo actualizar el consentimiento.', error: true })
    } finally {
      setBusy(null)
    }
  }

  return <section aria-labelledby="consent-manager-title" className="mt-6 space-y-3 rounded-3xl border border-border/70 p-5">
    <div>
      <h2 id="consent-manager-title" className="text-lg font-bold text-foreground">Tus consentimientos</h2>
      <p className="mt-1 text-sm text-muted-foreground">Decide qué información puede consultar tu entrenador mientras el acompañamiento esté activo.</p>
    </div>
    <article className="rounded-2xl bg-muted/30 p-4">
      <h3 className="font-semibold text-foreground">Datos de entrenamiento</h3>
      <ConsentStatus consent={training} />
      <p className="mt-2 text-sm text-muted-foreground">Al revocar estos datos se finalizará el acompañamiento y se revocarán todos los accesos profesionales.</p>
      <button type="button" onClick={() => void act('revoke-training')} disabled={busy !== null}
        className="mt-3 min-h-11 rounded-xl border border-red-500/40 px-4 text-sm font-semibold text-foreground disabled:opacity-50">{busy === 'revoke-training' ? 'Guardando…' : 'Revocar datos de entrenamiento'}</button>
    </article>
    <article className="rounded-2xl bg-muted/30 p-4">
      <h3 className="font-semibold text-foreground">Medidas corporales</h3>
      <ConsentStatus consent={body} />
      <p className="mt-2 text-sm text-muted-foreground">Puedes autorizar o revocar estas medidas; no finalizará el acompañamiento.</p>
      <button type="button" onClick={() => void act(bodyGranted ? 'revoke-body' : 'grant')} disabled={busy !== null}
        className="mt-3 min-h-11 rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground disabled:opacity-50">{busy === 'grant' || busy === 'revoke-body' ? 'Guardando…' : bodyGranted ? 'Revocar medidas corporales' : 'Autorizar medidas corporales'}</button>
    </article>
    {message.text ? <p {...(message.error ? { role: 'alert' } : { 'aria-live': 'polite' })} className="text-sm text-muted-foreground">{message.text}</p> : null}
  </section>
}
