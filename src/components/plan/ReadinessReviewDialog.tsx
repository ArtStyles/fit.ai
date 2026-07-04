'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { loadReadinessReview, saveReadinessReview } from '@/app/actions/readiness'
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

type ActivityLevel = 'inactive' | 'insufficiently_active' | 'regularly_active'
type EditableLimitation = Omit<MovementLimitation, 'movementsToAvoid'> & {
  clientId: string
  movementsText: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

function editableLimitation(limitation?: MovementLimitation, index = 0): EditableLimitation {
  return {
    clientId: limitation ? `saved-${index}` : `new-${Date.now()}-${index}`,
    region: limitation?.region ?? '',
    side: limitation?.side ?? null,
    status: limitation?.status ?? 'stable',
    movementsText: limitation?.movementsToAvoid.join(', ') ?? '',
    clinicianCleared: limitation?.clinicianCleared ?? false,
  }
}

export function ReadinessReviewDialog({ open, onOpenChange, onSaved }: Props) {
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('insufficiently_active')
  const [cardio, setCardio] = useState<CardioModality[]>(['walking'])
  const [warning, setWarning] = useState(false)
  const [knownDisease, setKnownDisease] = useState(false)
  const [recentSurgery, setRecentSurgery] = useState(false)
  const [medicallyCleared, setMedicallyCleared] = useState(false)
  const [limitations, setLimitations] = useState<EditableLimitation[]>([])
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingProfile(true)
    setProfileLoaded(false)
    setError(null)

    void loadReadinessReview().then(result => {
      if (cancelled) return
      setLoadingProfile(false)
      if (!result.success || !result.data) {
        setError(result.error ?? 'No se pudo cargar la revisión actual.')
        return
      }
      setActivityLevel(result.data.activityLevel)
      setCardio(result.data.cardioPreferences)
      setWarning(result.data.warningSymptoms.length > 0)
      setKnownDisease(result.data.knownDisease)
      setRecentSurgery(result.data.recentSurgery)
      setMedicallyCleared(result.data.medicallyCleared)
      setLimitations(result.data.limitations.map(editableLimitation))
      setProfileLoaded(true)
    })

    return () => { cancelled = true }
  }, [open])

  function toggleCardio(modality: CardioModality) {
    setCardio(current => current.includes(modality)
      ? current.filter(item => item !== modality)
      : [...current, modality])
  }

  function updateLimitation(clientId: string, patch: Partial<EditableLimitation>) {
    setLimitations(current => current.map(item => item.clientId === clientId ? { ...item, ...patch } : item))
  }

  function addLimitation() {
    if (limitations.length >= 8) return
    setLimitations(current => [...current, editableLimitation(undefined, current.length)])
  }

  async function save() {
    if (limitations.some(item => !item.region.trim() || !item.movementsText.trim())) {
      setError('Cada limitación necesita una zona y los movimientos que deben evitarse.')
      return
    }

    setSaving(true)
    setError(null)
    const result = await saveReadinessReview({
      activityLevel,
      cardioPreferences: cardio,
      warningSymptoms: warning ? ['self_reported_warning_symptom'] : [],
      knownDisease,
      recentSurgery,
      medicallyCleared,
      limitations: limitations.map(({ clientId: _clientId, movementsText, ...limitation }) => ({
        ...limitation,
        movementsToAvoid: movementsText.split(',').map(value => value.trim()).filter(Boolean),
      })),
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

        {loadingProfile ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Cargando tu revisión actual…</p>
        ) : !profileLoaded ? (
          <div className="space-y-3 py-5 text-center">
            <p className="text-sm text-red-400">{error ?? 'No se pudo cargar la revisión actual.'}</p>
            <button type="button" onClick={() => onOpenChange(false)} className="h-10 rounded-lg border border-border px-4 text-sm">
              Cerrar
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium">Actividad habitual
              <select value={activityLevel} onChange={event => setActivityLevel(event.target.value as ActivityLevel)}
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

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Limitaciones musculoesqueléticas</p>
                  <p className="text-xs text-muted-foreground">Se conservan hasta que las elimines explícitamente.</p>
                </div>
                <button type="button" onClick={addLimitation} disabled={limitations.length >= 8}
                  className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-2.5 text-xs disabled:opacity-40">
                  <Plus className="h-3.5 w-3.5" /> Añadir
                </button>
              </div>

              {limitations.map((limitation, index) => (
                <div key={limitation.clientId} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limitación {index + 1}</p>
                    <button type="button" aria-label={`Eliminar limitación ${index + 1}`}
                      onClick={() => setLimitations(current => current.filter(item => item.clientId !== limitation.clientId))}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <input value={limitation.region} onChange={event => updateLimitation(limitation.clientId, { region: event.target.value })}
                    placeholder="Zona: rodilla, hombro..." className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={limitation.side ?? ''} onChange={event => updateLimitation(limitation.clientId, { side: (event.target.value || null) as MovementLimitation['side'] })}
                      className="h-10 rounded-md border border-border bg-background px-2 text-sm">
                      <option value="">Sin lado</option><option value="left">Izquierda</option><option value="right">Derecha</option><option value="both">Ambos lados</option>
                    </select>
                    <select value={limitation.status} onChange={event => updateLimitation(limitation.clientId, { status: event.target.value as MovementLimitation['status'] })}
                      className="h-10 rounded-md border border-border bg-background px-2 text-sm">
                      <option value="stable">Estable</option><option value="recovering">En recuperación</option><option value="acute">Aguda</option>
                    </select>
                  </div>
                  <input value={limitation.movementsText}
                    onChange={event => updateLimitation(limitation.clientId, { movementsText: event.target.value })}
                    placeholder="Movimientos a evitar, separados por comas" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" />
                  <label className="flex gap-2 text-xs"><input type="checkbox" checked={limitation.clinicianCleared}
                    onChange={event => updateLimitation(limitation.clientId, { clinicianCleared: event.target.checked })} /> Autorizado por un profesional respetando estas restricciones.</label>
                </div>
              ))}
            </section>

            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <button type="button" disabled={saving || cardio.length === 0} onClick={save}
              className="h-11 w-full rounded-lg bg-primary font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar y regenerar'}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
