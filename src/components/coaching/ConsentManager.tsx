'use client'

import { useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/i18n/I18nProvider'
import { dateLocale } from '@/lib/i18n'

export type CoachingConsentView = {
  scope: 'training_profile' | 'body_measurements'
  textVersion: string
  grantedAt: string
  revokedAt: string | null
}

type ConsentAction = 'grant-training' | 'grant-body' | 'revoke-body' | 'revoke-training'

function nextIdempotencyKey() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}

function ConsentStatus({ consent }: { consent?: CoachingConsentView }) {
  const { language, timeZone } = useI18n()
  if (!consent) return <p className="mt-2 text-sm text-muted-foreground">No hay una autorización activa para este alcance.</p>
  const date = new Intl.DateTimeFormat(dateLocale(language), { dateStyle: 'medium', timeZone }).format(new Date(consent.grantedAt))
  return <p className="mt-2 text-sm text-muted-foreground">Versión {consent.textVersion}. Otorgado el {date}.</p>
}

export function ConsentManager({ relationshipId, consents }: { relationshipId: string; consents: CoachingConsentView[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<ConsentAction | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: '', error: false })
  const attemptKeys = useRef(new Map<ConsentAction, string>())
  const training = consents.find(consent => consent.scope === 'training_profile' && !consent.revokedAt)
  const body = consents.find(consent => consent.scope === 'body_measurements' && !consent.revokedAt)
  const trainingGranted = Boolean(training)
  const bodyGranted = Boolean(body)

  async function act(action: ConsentAction) {
    const confirmation = action === 'revoke-training'
      ? '¿Revocar datos de entrenamiento y finalizar este acompañamiento?'
      : action === 'revoke-body'
        ? '¿Revocar el acceso a tus medidas corporales?'
        : action === 'grant-training'
          ? '¿Autorizar que tu entrenador consulte tus datos de entrenamiento? Tus medidas corporales no se incluyen.'
          : '¿Autorizar compartir tus medidas corporales?'
    if (!window.confirm(confirmation)) return

    setBusy(action)
    setMessage({ text: '', error: false })
    try {
      const formData = new FormData()
      formData.set('relationshipId', relationshipId)
      const idempotencyKey = attemptKeys.current.get(action) ?? nextIdempotencyKey()
      attemptKeys.current.set(action, idempotencyKey)
      formData.set('idempotencyKey', idempotencyKey)

      const actions = await import('@/app/actions/coachingRelationships')
      const result = action === 'grant-training'
        ? await actions.grantTrainingProfileConsent(formData)
        : action === 'grant-body'
          ? await actions.grantBodyMeasurementsConsent(formData)
          : action === 'revoke-body'
            ? await actions.revokeBodyMeasurementsConsent(formData)
            : await actions.revokeTrainingProfileConsent(formData)
      setMessage({
        text: result.ok
          ? action === 'revoke-training'
            ? 'Tus datos fueron revocados y el acompañamiento finalizó.'
            : action === 'grant-training'
              ? 'Tus datos de entrenamiento fueron autorizados.'
              : 'Tu consentimiento fue actualizado.'
          : result.error,
        error: !result.ok,
      })
      if (result.ok) {
        attemptKeys.current.delete(action)
        router.refresh()
      }
    } catch {
      setMessage({ text: 'No se pudo actualizar el consentimiento.', error: true })
    } finally {
      setBusy(null)
    }
  }

  return <section id="shared-coaching-data" aria-labelledby="consent-manager-title" className="rounded-2xl border border-border/70 bg-card p-4">
    <h2 id="consent-manager-title" className="text-base font-bold text-foreground">Datos compartidos</h2>
    <dl className="mt-2 divide-y divide-border/60 text-sm">
      <div className="flex items-start justify-between gap-4 py-3">
        <dt className="min-w-0 text-muted-foreground">Datos de entrenamiento</dt>
        <dd className={`shrink-0 font-semibold ${trainingGranted ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-200'}`}>{trainingGranted ? 'Autorizados' : 'Sin autorizar'}</dd>
      </div>
      <div className="flex items-start justify-between gap-4 py-3">
        <dt className="min-w-0 text-muted-foreground">Medidas corporales <span className="block text-xs">Opcional</span></dt>
        <dd className="shrink-0 font-semibold text-foreground">{bodyGranted ? 'Compartidas' : 'Privadas'}</dd>
      </div>
    </dl>
    {!trainingGranted ? <div className="my-3 rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
      <h3 className="font-semibold text-foreground">Falta un paso para recibir tu rutina</h3>
      <p className="mt-2 text-sm text-muted-foreground">Autoriza a tu entrenador a consultar tus datos de entrenamiento. Tus medidas corporales no se incluyen.</p>
      <button type="button" onClick={() => void act('grant-training')} disabled={busy !== null}
        className="mt-3 min-h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 disabled:opacity-50">{busy === 'grant-training' ? 'Autorizando…' : 'Autorizar datos de entrenamiento'}</button>
    </div> : null}
    <details className="group border-t border-border/70">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg text-sm font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">Gestionar datos compartidos<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>
      <div className="space-y-4 pb-1 pt-2">
        <article className="rounded-xl bg-muted/30 p-4">
          <h3 className="font-semibold text-foreground">Datos para preparar tu rutina — Necesario</h3>
          {trainingGranted ? <>
            <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">Autorización activa</p>
            <ConsentStatus consent={training} />
            <p className="mt-2 text-sm text-muted-foreground">Al revocar estos datos se finalizará el acompañamiento y se revocarán todos los accesos profesionales.</p>
            <button type="button" onClick={() => void act('revoke-training')} disabled={busy !== null}
              className="mt-3 min-h-11 rounded-xl border border-red-500/40 px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{busy === 'revoke-training' ? 'Guardando…' : 'Revocar datos de entrenamiento'}</button>
          </> : <p className="mt-2 text-sm text-muted-foreground">No hay una autorización activa para este alcance.</p>}
        </article>
        <article className="rounded-xl bg-muted/30 p-4">
          <h3 className="font-semibold text-foreground">Medidas corporales — Opcional</h3>
          <ConsentStatus consent={body} />
          <p className="mt-2 text-sm text-muted-foreground">Puedes autorizar o revocar estas medidas; no finalizará el acompañamiento.</p>
          <button type="button" onClick={() => void act(bodyGranted ? 'revoke-body' : 'grant-body')} disabled={busy !== null}
            className="mt-3 min-h-11 rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50">{busy === 'grant-body' || busy === 'revoke-body' ? 'Guardando…' : bodyGranted ? 'Revocar medidas corporales' : 'Autorizar medidas corporales'}</button>
        </article>
      </div>
    </details>
    {message.text ? <p {...(message.error ? { role: 'alert' } : { 'aria-live': 'polite' })} className="mt-3 text-sm text-muted-foreground">{message.text}</p> : null}
  </section>
}
