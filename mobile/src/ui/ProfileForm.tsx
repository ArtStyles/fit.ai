import { useState, type FormEvent } from 'react'
import { ArrowRight, ShieldCheck, Plus, Trash2 } from 'lucide-react'
import { getReadinessReviewStatus } from '@/lib/training-engine/safety'
import type { TrainingProfile, MovementLimitation } from '@/lib/training-engine/types'
import type { MobileAccount } from '../domain/types'
import { defaultTrainingProfile } from '../domain/training'

export function ProfileForm({ account, onSave, onCancel }: { account?: MobileAccount; onSave: (name: string, profile: TrainingProfile) => Promise<void>; onCancel?: () => void }) {
  const [profile, setProfile] = useState<TrainingProfile>(() => structuredClone(account?.profile ?? defaultTrainingProfile()))
  const [name, setName] = useState(account?.name ?? '')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const readiness = profile.readiness
  function patchReadiness(patch: Partial<TrainingProfile['readiness']>) { setProfile(p => ({ ...p, readiness: { ...p.readiness, ...patch } })) }
  function patchLimitation(index: number, patch: Partial<MovementLimitation>) { patchReadiness({ limitations: readiness.limitations.map((l, i) => i === index ? { ...l, ...patch } : l) }) }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!confirmed || busy) return
    if (readiness.limitations.some(l => !l.region.trim() || !l.movementsToAvoid.length)) { setError('Indica la zona y los movimientos a evitar en cada limitación.'); return }
    setBusy(true); setError('')
    try {
      const status = getReadinessReviewStatus({ ...readiness, knownDisease: readiness.knownCardiovascularMetabolicOrRenalDisease })
      await onSave(name.trim(), { ...profile, readiness: { ...readiness, status } })
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. Tus respuestas siguen aquí.') }
    finally { setBusy(false) }
  }
  return <form className="profile-form stack" onSubmit={submit}>
    <div className="section-heading"><span className="eyebrow">{account ? 'TU PERFIL' : 'HECHO PARA TI'}</span><h1>{account ? 'Ajusta tu entrenamiento' : 'Tu ritmo. Tu espacio.'}</h1><p>Entrena con Vekira, incluso sin conexión. Tu progreso se guarda en este dispositivo.</p></div>
    <fieldset disabled={busy} className="stack">
      <section className="card stack"><h2>Empecemos contigo</h2><label>Tu nombre<input autoComplete="given-name" required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="¿Cómo te llamas?" /></label>
        <div className="form-grid"><label>Edad<input type="number" inputMode="numeric" required min={13} max={100} value={profile.age ?? ''} onChange={e => setProfile({ ...profile, age: e.target.value ? Number(e.target.value) : null })} /></label><label>Experiencia<select value={profile.fitnessLevel} onChange={e => setProfile({ ...profile, fitnessLevel: e.target.value as TrainingProfile['fitnessLevel'] })}><option value="beginner">Estoy empezando</option><option value="intermediate">Tengo experiencia</option><option value="advanced">Nivel avanzado</option></select></label></div>
        <label>Mi objetivo<select value={profile.primaryGoal} onChange={e => setProfile({ ...profile, primaryGoal: e.target.value as TrainingProfile['primaryGoal'] })}><option value="stay_active">Mantenerme activo</option><option value="build_muscle">Ganar músculo</option><option value="gain_strength">Ganar fuerza</option><option value="lose_weight">Perder peso</option><option value="improve_endurance">Mejorar resistencia</option></select></label>
        <div className="form-grid"><label>Días por semana<select value={profile.daysPerWeek} onChange={e => setProfile({ ...profile, daysPerWeek: Number(e.target.value), preferredWorkoutDays: null })}>{[3, 4, 5, 6].map(d => <option key={d} value={d}>{d} días</option>)}</select></label><label>Tiempo por sesión<select value={profile.sessionDurationMinutes} onChange={e => setProfile({ ...profile, sessionDurationMinutes: Number(e.target.value) })}>{[30, 45, 60, 90].map(d => <option key={d} value={d}>{d} minutos</option>)}</select></label></div>
        <label>Dónde entrenas<select value={profile.gymType} onChange={e => setProfile({ ...profile, gymType: e.target.value as TrainingProfile['gymType'], availableEquipment: e.target.value === 'home_basic' ? ['dumbbells', 'resistance_band'] : [] })}><option value="home_no_equipment">En casa · sin material</option><option value="home_basic">En casa · material básico</option><option value="full_gym">Gimnasio completo</option></select></label>
        {profile.gymType === 'home_basic' && <fieldset className="stack compact"><legend>Material disponible</legend>{[['dumbbells', 'Mancuernas'], ['resistance_band', 'Bandas elásticas'], ['bench', 'Banco'], ['kettlebell', 'Kettlebell'], ['pull_up_bar', 'Barra de dominadas']].map(([key, title]) => <label className="check" key={key}><input type="checkbox" checked={profile.availableEquipment.includes(key)} onChange={e => setProfile({ ...profile, availableEquipment: e.target.checked ? [...profile.availableEquipment, key] : profile.availableEquipment.filter(x => x !== key) })} />{title}</label>)}</fieldset>}
      </section>
      <section className="card stack"><div className="row"><ShieldCheck className="violet" /><h2>Antes de entrenar</h2></div><p className="muted">Estas respuestas permiten aplicar las reglas de seguridad del plan. No es un diagnóstico médico.</p>
        <label className="check"><input type="checkbox" checked={readiness.currentlyActive} onChange={e => patchReadiness({ currentlyActive: e.target.checked })} />Hago 30 minutos de actividad moderada, al menos 3 días por semana.</label>
        <label className="check"><input type="checkbox" checked={readiness.warningSymptoms.length > 0} onChange={e => patchReadiness({ warningSymptoms: e.target.checked ? ['self_reported_warning_symptom'] : [] })} />Presento dolor torácico, falta de aire leve, desmayo, palpitaciones o fatiga inusual.</label>
        <label className="check"><input type="checkbox" checked={readiness.knownCardiovascularMetabolicOrRenalDisease} onChange={e => patchReadiness({ knownCardiovascularMetabolicOrRenalDisease: e.target.checked })} />Tengo una enfermedad cardiovascular, metabólica o renal diagnosticada.</label>
        <label className="check"><input type="checkbox" checked={readiness.recentSurgery} onChange={e => patchReadiness({ recentSurgery: e.target.checked })} />Tuve cirugía reciente o tengo una restricción médica.</label>
        {(readiness.warningSymptoms.length > 0 || readiness.knownCardiovascularMetabolicOrRenalDisease || readiness.recentSurgery) && <label className="check notice"><input type="checkbox" checked={readiness.medicallyCleared} onChange={e => patchReadiness({ medicallyCleared: e.target.checked })} />Tengo autorización profesional para este nivel de ejercicio.</label>}
        <div className="row between"><h3>Lesiones o limitaciones</h3><button type="button" className="secondary small" disabled={readiness.limitations.length >= 8} onClick={() => patchReadiness({ limitations: [...readiness.limitations, { region: '', status: 'stable', movementsToAvoid: [], clinicianCleared: false }] })}><Plus size={16} /> Añadir</button></div>
        {readiness.limitations.map((l, i) => <div className="inset stack compact" key={i}><div className="row between"><strong>Limitación {i + 1}</strong><button type="button" className="icon-button" aria-label={`Eliminar limitación ${i + 1}`} onClick={() => patchReadiness({ limitations: readiness.limitations.filter((_, j) => j !== i) })}><Trash2 size={18} /></button></div><label>Zona afectada<input value={l.region} required onChange={e => patchLimitation(i, { region: e.target.value })} /></label><label>Estado<select value={l.status} onChange={e => patchLimitation(i, { status: e.target.value as MovementLimitation['status'] })}><option value="stable">Estable</option><option value="recovering">En recuperación</option><option value="acute">Aguda</option></select></label><label>Movimientos a evitar, separados por comas<input required value={l.movementsToAvoid.join(',')} onChange={e => patchLimitation(i, { movementsToAvoid: e.target.value.split(',') })} /></label><label className="check"><input type="checkbox" checked={l.clinicianCleared} onChange={e => patchLimitation(i, { clinicianCleared: e.target.checked })} />Un profesional me autorizó respetando estas restricciones.</label></div>)}
        <label className="check confirmation"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />He revisado mis respuestas y describen mi situación actual.</label>
      </section>
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary full" disabled={!confirmed}>{busy ? 'Guardando…' : account ? 'Guardar perfil' : 'Crear mi espacio'}<ArrowRight size={19} /></button>
      {onCancel && <button type="button" className="secondary full" onClick={onCancel}>Volver</button>}
    </fieldset>
  </form>
}
