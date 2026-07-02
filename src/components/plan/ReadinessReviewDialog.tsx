'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { saveReadinessReview } from '@/app/actions/readiness'
import type { CardioModality, MovementLimitation } from '@/lib/training-engine'

const CARDIO: Array<[CardioModality, string]> = [
  ['walking', 'Caminar'],
  ['running', 'Correr'],
  ['cycling', 'Bicicleta'],
  ['elliptical', 'Elíptica'],
  ['rowing', 'Remo'],
  ['stairs', 'Escaleras'],
  ['jump_rope', 'Cuerda'],
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function ReadinessReviewDialog({ open, onOpenChange, onSaved }: Props) {
  const [activityLevel, setActivityLevel] = useState<'inactive' | 'insufficiently_active' | 'regularly_active'>('insufficiently_active')
  const [cardio, setCardio] = useState<CardioModality[]>(['walking'])
  const [warning, setWarning] = useState(false)
  const [knownDisease, setKnownDisease] = useState(false)
  const [recentSurgery, setRecentSurgery] = useState(false)
  const [medicallyCleared, setMedicallyCleared] = useState(false)
  const [hasLimitation, setHasLimitation] = useState(false)
  const [region, setRegion] = useState('')
  const [limitationStatus, setLimitationStatus] = useState<MovementLimitation['status']>('stable')
  const [movements, setMovements] = useState('')
  const [clinicianCleared, setClinicianCleared] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleCardio(modality: CardioModality) {
    setCardio(current => current.includes(modality)
      ? current.filter(item => item !== modality)
      : [...current, modality])
  }

  async function save() {
    setSaving(true)
    setError(null)
    const limitation: MovementLimitation | null = hasLimitation ? {
      region: region.trim(),
      side: null,
      status: limitationStatus,
      movementsToAvoid: movements.split(',').map(value => value.trim()).filter(Boolean),
      clinicianCleared,
    } : null
    if (hasLimitation && (!region.trim() || movements.split(',').map(value => value.trim()).filter(Boolean).length === 0)) {
      setSaving(false)
      setError('Indica la zona y los movimientos que deben evitarse.')
      return
    }

    const result = await saveReadinessReview({
      activityLevel,
      cardioPreferences: cardio,
      warningSymptoms: warning ? ['self_reported_warning_symptom'] : [],
      knownDisease,
      recentSurgery,
      medicallyCleared,
      limitation,
    })
    setSaving(false)
    if (!result.success) {
      setError(result.error ?? 'No se pudo guardar la revisión.')
      return
    }
    onOpenChange(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>Revisión antes de regenerar</DialogTitle></DialogHeader>
        <p className="text-xs leading-relaxed text-muted-foreground">
          No es un diagnóstico. Si declaras señales de alarma o una lesión aguda, la generación automática se detendrá.
        </p>

        <div className="space-y-4">
          <label className="block text-sm font-medium">Actividad habitual
            <select value={activityLevel} onChange={event => setActivityLevel(event.target.value as typeof activityLevel)}
              className="mt-1 h-11 w-full rounded-lg border border-border bg-background px-3">
              <option value="inactive">Casi ninguna</option>
              <option value="insufficiently_active">Algo, menos de 3 días/semana</option>
              <option value="regularly_active">30 min moderados, 3+ días/semana</option>
            </select>
          </label>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Cardio aceptado</legend>
            <div className="flex flex-wrap gap-2">
              {CARDIO.map(([value, label]) => (
                <button key={value} type="button" onClick={() => toggleCardio(value)} aria-pressed={cardio.includes(value)}
                  className={`rounded-full border px-3 py-2 text-xs ${cardio.includes(value) ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}>
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex gap-2 text-sm"><input type="checkbox" checked={warning} onChange={event => setWarning(event.target.checked)} /> Presento dolor torácico, falta de aire leve, desmayo, palpitaciones o fatiga inusual.</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={knownDisease} onChange={event => setKnownDisease(event.target.checked)} /> Tengo una enfermedad cardiovascular, metabólica o renal diagnosticada.</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={recentSurgery} onChange={event => setRecentSurgery(event.target.checked)} /> Tuve cirugía reciente o tengo una restricción médica.</label>
          {(warning || knownDisease || recentSurgery) ? (
            <label className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><input type="checkbox" checked={medicallyCleared} onChange={event => setMedicallyCleared(event.target.checked)} /> Tengo autorización profesional para este nivel de ejercicio.</label>
          ) : null}

          <label className="flex gap-2 text-sm"><input type="checkbox" checked={hasLimitation} onChange={event => setHasLimitation(event.target.checked)} /> Tengo una limitación musculoesquelética.</label>
          {hasLimitation ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <input value={region} onChange={event => setRegion(event.target.value)} placeholder="Zona: rodilla, hombro..." className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" />
              <select value={limitationStatus} onChange={event => setLimitationStatus(event.target.value as MovementLimitation['status'])} className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm">
                <option value="stable">Estable</option><option value="recovering">En recuperación</option><option value="acute">Aguda</option>
              </select>
              <input value={movements} onChange={event => setMovements(event.target.value)} placeholder="Movimientos a evitar, separados por comas" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" />
              <label className="flex gap-2 text-xs"><input type="checkbox" checked={clinicianCleared} onChange={event => setClinicianCleared(event.target.checked)} /> Autorizado por un profesional respetando estas restricciones.</label>
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button type="button" disabled={saving || cardio.length === 0} onClick={save}
            className="h-11 w-full rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar y regenerar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
