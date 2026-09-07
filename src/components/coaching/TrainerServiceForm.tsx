'use client'

import { useId, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import {
  createTrainerService,
  setTrainerServiceActive,
  updateTrainerService,
} from '@/app/actions/trainerServices'
import type { TrainerServiceModality } from '@/lib/coaching/serviceValidation'

export type TrainerServiceFormValue = {
  id: string
  name: string
  description: string
  modality: TrainerServiceModality
  durationMinutes: number
  content: string
  capacity: number
  isActive: boolean
}

type FieldErrors = Record<string, string>
type SaveResult =
  | { ok: true; serviceId: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors }
type SaveAction = (formData: FormData) => Promise<SaveResult>

export async function persistTrainerServiceChanges(input: FormData, save: SaveAction) {
  try {
    const result = await save(input)
    return result.ok
      ? { ...result, announcement: 'Servicio guardado.' as const }
      : { ...result, announcement: result.error }
  } catch {
    return { ok: false as const, error: 'No se pudo guardar el servicio.', announcement: 'No se pudo guardar el servicio.' }
  }
}

function trainerServiceFieldAccessibility(instanceId: string, name: string, hasError: boolean) {
  const inputId = `service-${instanceId}-${name}`
  const errorId = `${inputId}-error`
  return {
    inputId,
    errorId,
    describedBy: hasError ? errorId : undefined,
  }
}

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <p id={id} role="alert" className="mt-1 text-sm text-red-300">{error}</p> : null
}

export function TrainerServiceForm({ initialService }: { initialService?: TrainerServiceFormValue }) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [announcement, setAnnouncement] = useState('')
  const [saving, setSaving] = useState(false)
  const [isActive, setIsActive] = useState(initialService?.isActive ?? true)
  const instanceId = useId()
  const nameField = trainerServiceFieldAccessibility(instanceId, 'name', Boolean(fieldErrors.name))
  const descriptionField = trainerServiceFieldAccessibility(instanceId, 'description', Boolean(fieldErrors.description))
  const modalityField = trainerServiceFieldAccessibility(instanceId, 'modality', Boolean(fieldErrors.modality))
  const durationField = trainerServiceFieldAccessibility(instanceId, 'durationMinutes', Boolean(fieldErrors.durationMinutes))
  const capacityField = trainerServiceFieldAccessibility(instanceId, 'capacity', Boolean(fieldErrors.capacity))
  const contentField = trainerServiceFieldAccessibility(instanceId, 'content', Boolean(fieldErrors.content))

  async function saveService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const result = await persistTrainerServiceChanges(
      new FormData(event.currentTarget),
      initialService ? updateTrainerService : createTrainerService,
    )
    setSaving(false)
    setAnnouncement(result.announcement)
    setFieldErrors(result.ok ? {} : result.fieldErrors ?? {})
  }

  async function toggleService() {
    if (!initialService || saving) return
    setSaving(true)
    const formData = new FormData()
    formData.set('serviceId', initialService.id)
    formData.set('isActive', String(!isActive))
    try {
      const result = await setTrainerServiceActive(formData)
      if (result.ok) {
        setIsActive(result.isActive)
        setFieldErrors({})
        setAnnouncement(result.isActive ? 'Servicio activado.' : 'Servicio desactivado.')
      } else {
        setFieldErrors(result.fieldErrors ?? {})
        setAnnouncement(result.error)
      }
    } catch {
      setAnnouncement('No se pudo actualizar el estado del servicio.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={event => void saveService(event)} noValidate className="rounded-3xl border border-border/60 bg-muted/10 p-5 sm:p-6">
      {initialService ? <input type="hidden" name="serviceId" value={initialService.id} /> : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">{initialService ? 'Editar servicio' : 'Nuevo servicio'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Describe cómo acompañas a tus clientes.</p>
        </div>
        {initialService ? <span className="rounded-full border border-border/70 px-3 py-1 text-xs font-semibold text-muted-foreground">{isActive ? 'Activo' : 'Inactivo'}</span> : null}
      </div>

      <div className="mt-6 space-y-5">
        <label htmlFor={nameField.inputId} className="block text-sm font-semibold text-foreground">
          Nombre del servicio
          <input id={nameField.inputId} name="name" defaultValue={initialService?.name ?? ''} maxLength={160} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={nameField.describedBy} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
          <FieldError id={nameField.errorId} error={fieldErrors.name} />
        </label>
        <label htmlFor={descriptionField.inputId} className="block text-sm font-semibold text-foreground">
          Descripción
          <textarea id={descriptionField.inputId} name="description" defaultValue={initialService?.description ?? ''} rows={4} maxLength={4000} aria-invalid={Boolean(fieldErrors.description)} aria-describedby={descriptionField.describedBy} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal" />
          <FieldError id={descriptionField.errorId} error={fieldErrors.description} />
        </label>
        <div className="grid gap-5 sm:grid-cols-3">
          <label htmlFor={modalityField.inputId} className="text-sm font-semibold text-foreground">
            Modalidad
            <select id={modalityField.inputId} name="modality" defaultValue={initialService?.modality ?? 'online'} aria-invalid={Boolean(fieldErrors.modality)} aria-describedby={modalityField.describedBy} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal">
              <option value="online">En línea</option>
              <option value="in_person">Presencial</option>
              <option value="hybrid">Híbrida</option>
            </select>
            <FieldError id={modalityField.errorId} error={fieldErrors.modality} />
          </label>
          <label htmlFor={durationField.inputId} className="text-sm font-semibold text-foreground">
            Duración
            <input id={durationField.inputId} name="durationMinutes" type="number" min="15" max="480" defaultValue={initialService?.durationMinutes ?? 60} aria-invalid={Boolean(fieldErrors.durationMinutes)} aria-describedby={durationField.describedBy} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
            <FieldError id={durationField.errorId} error={fieldErrors.durationMinutes} />
          </label>
          <label htmlFor={capacityField.inputId} className="text-sm font-semibold text-foreground">
            Cupo
            <input id={capacityField.inputId} name="capacity" type="number" min="1" max="1000" defaultValue={initialService?.capacity ?? 1} aria-invalid={Boolean(fieldErrors.capacity)} aria-describedby={capacityField.describedBy} className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
            <FieldError id={capacityField.errorId} error={fieldErrors.capacity} />
          </label>
        </div>
        <label htmlFor={contentField.inputId} className="block text-sm font-semibold text-foreground">
          Contenido incluido
          <textarea id={contentField.inputId} name="content" defaultValue={initialService?.content ?? ''} rows={4} maxLength={4000} aria-invalid={Boolean(fieldErrors.content)} aria-describedby={contentField.describedBy} className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-3 font-normal" />
          <FieldError id={contentField.errorId} error={fieldErrors.content} />
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={saving} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {saving ? 'Guardando…' : 'Guardar servicio'}
        </button>
        {initialService ? <button type="button" onClick={() => void toggleService()} disabled={saving} className="min-h-11 rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">{isActive ? 'Desactivar servicio' : 'Activar servicio'}</button> : null}
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-muted-foreground">{announcement}</p>
    </form>
  )
}
