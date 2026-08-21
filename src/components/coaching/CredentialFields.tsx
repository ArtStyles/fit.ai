'use client'

import { useState } from 'react'
import { FileCheck2, Link2, Loader2, Trash2 } from 'lucide-react'
import { removeTrainerCredential, uploadTrainerCredential } from '@/app/actions/trainerApplications'
import { validateTrainerCredential } from '@/lib/coaching/applicationValidation'
import type { TrainerApplicationStatus } from '@/lib/coaching/status'

export type TrainerCredentialView = {
  id: string
  credentialType: 'document' | 'link'
  title: string
  issuer: string | null
  issuedOn: string | null
  expiresOn: string | null
  externalUrl: string | null
  fileName: string | null
}

type FieldErrors = Record<string, string>

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="mt-1 text-sm text-red-300">{message}</p> : null
}

function httpsUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname ? url.toString() : null
  } catch {
    return null
  }
}

export function CredentialFields({
  applicationId,
  status,
  initialCredentials,
  onCountChange,
  focusTargetId,
  errorId,
  invalid = false,
}: {
  applicationId: string | null
  status: TrainerApplicationStatus
  initialCredentials: TrainerCredentialView[]
  onCountChange: (count: number) => void
  focusTargetId?: string
  errorId?: string
  invalid?: boolean
}) {
  const editable = status === 'draft' || status === 'changes_requested'
  const [credentials, setCredentials] = useState(initialCredentials)
  const [credentialType, setCredentialType] = useState<'link' | 'document'>('document')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  async function addCredential(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!applicationId || busy) return
    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set('applicationId', applicationId)
    formData.set('credentialType', credentialType)
    const fileValue = formData.get('file')
    const validation = validateTrainerCredential({
      credentialType,
      title: String(formData.get('title') ?? ''),
      issuer: String(formData.get('issuer') ?? ''),
      issuedOn: String(formData.get('issuedOn') ?? ''),
      expiresOn: String(formData.get('expiresOn') ?? ''),
      externalUrl: String(formData.get('externalUrl') ?? ''),
      file: fileValue instanceof File && fileValue.size > 0 ? fileValue : null,
    })
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors ?? {})
      setAnnouncement('Revisa los campos de la credencial.')
      return
    }

    setBusy(true)
    setFieldErrors({})
    try {
      const result = await uploadTrainerCredential(formData)
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {})
        setAnnouncement(result.error)
        return
      }

      const value = validation.value
      const added: TrainerCredentialView = {
        id: result.credentialId,
        credentialType: value.credentialType,
        title: value.title,
        issuer: value.issuer,
        issuedOn: value.issuedOn,
        expiresOn: value.expiresOn,
        externalUrl: value.externalUrl,
        fileName: value.file?.name ?? null,
      }
      setCredentials(current => {
        const next = [...current, added]
        onCountChange(next.length)
        return next
      })
      form.reset()
      setCredentialType('document')
      setAnnouncement('Credencial agregada.')
    } catch {
      setAnnouncement('No se pudo agregar la credencial.')
    } finally {
      setBusy(false)
    }
  }

  async function removeCredential(credentialId: string) {
    if (!applicationId || removingId) return
    setRemovingId(credentialId)
    const formData = new FormData()
    formData.set('applicationId', applicationId)
    formData.set('credentialId', credentialId)
    try {
      const result = await removeTrainerCredential(formData)
      if (!result.ok) {
        setAnnouncement(result.error)
        return
      }
      setCredentials(current => {
        const next = current.filter(credential => credential.id !== credentialId)
        onCountChange(next.length)
        return next
      })
      setAnnouncement('Credencial eliminada.')
    } catch {
      setAnnouncement('No se pudo eliminar la credencial.')
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <section
      id={focusTargetId}
      tabIndex={focusTargetId ? -1 : undefined}
      aria-labelledby="credentials-title"
      aria-invalid={invalid}
      aria-describedby={errorId}
      className="rounded-3xl border border-border/60 bg-muted/10 p-5 focus:outline-none focus:ring-2 focus:ring-red-400 sm:p-6"
    >
      <h2 id="credentials-title" className="text-lg font-bold text-foreground">Acreditación profesional</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Sube un certificado o acreditación. Si solo existe en internet, también puedes usar un enlace verificable.
      </p>

      {credentials.length > 0 ? (
        <ul className="mt-5 space-y-3" aria-label="Credenciales agregadas">
          {credentials.map(credential => {
            const safeLink = httpsUrl(credential.externalUrl)
            return (
              <li key={credential.id} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background/50 p-4">
                {credential.credentialType === 'link'
                  ? <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" aria-hidden="true" />
                  : <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{credential.title}</p>
                  {credential.issuer ? <p className="text-sm text-muted-foreground">{credential.issuer}</p> : null}
                  {safeLink ? (
                    <a href={safeLink} target="_blank" rel="noreferrer" className="mt-1 inline-block break-all text-sm text-violet-300 underline underline-offset-4">
                      Ver credencial
                    </a>
                  ) : credential.fileName ? <p className="mt-1 text-xs text-muted-foreground">{credential.fileName}</p> : null}
                </div>
                {editable ? (
                  <button
                    type="button"
                    onClick={() => void removeCredential(credential.id)}
                    disabled={Boolean(removingId)}
                    aria-label={`Eliminar ${credential.title}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-red-500/10 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-50"
                  >
                    {removingId === credential.id
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : <p className="mt-5 rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">Aún no has agregado credenciales.</p>}

      {editable ? (
        <form onSubmit={event => void addCredential(event)} className="mt-6 space-y-4" noValidate>
          <fieldset disabled={!applicationId || busy}>
            <legend className="text-sm font-semibold text-foreground">Agregar credencial</legend>
            {!applicationId ? <p className="mt-1 text-xs text-amber-200">Guarda primero el borrador para habilitar la carga privada.</p> : null}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(['document', 'link'] as const).map(value => (
                <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border/70 px-3 text-sm">
                  <input type="radio" name="credentialTypeChoice" value={value} checked={credentialType === value} onChange={() => setCredentialType(value)} />
                  {value === 'document' ? 'Subir documento' : 'Usar enlace verificable'}
                </label>
              ))}
            </div>

            <div className="mt-4">
              <label className="text-sm font-semibold text-foreground" htmlFor="credential-title">
                Título de la credencial
                <input id="credential-title" name="title" aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? 'credential-title-error' : undefined} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                <FieldError id="credential-title-error" message={fieldErrors.title} />
              </label>
            </div>

            {credentialType === 'document' ? (
              <div className="mt-4 text-sm font-semibold text-foreground">
                <label htmlFor="credential-file">Archivo de acreditación</label>
                <input id="credential-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png" aria-invalid={Boolean(fieldErrors.file)} aria-describedby={fieldErrors.file ? 'credential-file-error' : undefined} className="mt-2 block min-h-11 w-full rounded-xl border border-input bg-background px-3 py-2 font-normal" />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">PDF, JPEG o PNG de hasta 10 MB.</span>
                <FieldError id="credential-file-error" message={fieldErrors.file} />
              </div>
            ) : (
              <div className="mt-4 text-sm font-semibold text-foreground">
                <label htmlFor="credential-url">Enlace verificable</label>
                <input id="credential-url" name="externalUrl" type="url" inputMode="url" placeholder="https://sitio-de-la-entidad.example/certificado" aria-invalid={Boolean(fieldErrors.externalUrl)} aria-describedby={fieldErrors.externalUrl ? 'credential-url-error' : undefined} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">Debe comenzar con https:// para proteger la consulta.</span>
                <FieldError id="credential-url-error" message={fieldErrors.externalUrl} />
              </div>
            )}

            <details className="mt-4 rounded-xl border border-border/60 px-3 [&>summary]:flex [&>summary]:min-h-11 [&>summary]:cursor-pointer [&>summary]:items-center [&>summary]:text-sm [&>summary]:font-semibold [&>summary]:text-foreground">
              <summary>Añadir entidad y fechas (opcional)</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold text-foreground" htmlFor="credential-issuer">
                  Entidad emisora
                  <input id="credential-issuer" name="issuer" className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                </label>
                <label className="text-sm font-semibold text-foreground" htmlFor="credential-issued-on">
                  Fecha de emisión
                  <input id="credential-issued-on" name="issuedOn" type="date" className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                </label>
                <label className="text-sm font-semibold text-foreground" htmlFor="credential-expires-on">
                  Fecha de vencimiento
                  <input id="credential-expires-on" name="expiresOn" type="date" className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                </label>
              </div>
            </details>

            <button type="submit" className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-semibold text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? 'Agregando…' : 'Agregar credencial'}
            </button>
          </fieldset>
        </form>
      ) : null}

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </section>
  )
}
