'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { MUSCLE_GROUPS, type MuscleGroupId } from '@/lib/muscles/activity'
import type { FitnessEvidence } from '@/lib/fitness-card/types'
import geometry from '@/lib/muscles/geometry.json'
import styles from './fitness-card.module.css'

const regions: Record<string, MuscleGroupId> = { chest:'chest', abs:'core', obliques:'core', serratus:'core', biceps:'biceps', triceps:'triceps', deltoids:'shoulders', quadriceps:'quads', calves:'calves', adductors:'hips', hipFlexors:'hips', trapezius:'traps', upperBack:'back', lowerBack:'lower_back', neck:'neck', tibialis:'tibialis', forearm:'forearms', gluteal:'glutes', hamstring:'hamstrings' }

export function FitnessCardMuscles({ evidence }: { evidence: FitnessEvidence }) {
  const { language } = useI18n()
  const es = language === 'es'
  const [selected, setSelected] = useState<MuscleGroupId | null>(null)
  const maximum = Math.max(1, ...evidence.muscles.map(m => m.sessions))
  const count = (id: MuscleGroupId) => evidence.muscles.find(m => m.id === id)?.sessions ?? 0
  const group = MUSCLE_GROUPS.find(m => m.id === selected)
  const fill = (id: MuscleGroupId) => !count(id) ? 'hsl(var(--muted-foreground) / .22)' : ['#c4b5fd','#a78bfa','#8b5cf6','#7c3aed'][Math.min(3, Math.ceil(count(id) / maximum * 4) - 1)]
  return <>
    <div className={styles.mapFrame}>{geometry.models.map(model => <figure key={model.side}>
      <svg viewBox={model.viewBox} role="img" aria-label={model.side === 'front' ? (es ? 'Mapa muscular anterior' : 'Front muscle map') : (es ? 'Mapa muscular posterior' : 'Back muscle map')}>
        {model.parts.map(part => <g key={part.slug} fill={regions[part.slug] ? fill(regions[part.slug]) : 'hsl(var(--muted-foreground) / .12)'} opacity={selected && regions[part.slug] !== selected ? .35 : 1}>{part.paths.map((path, i) => <path key={i} d={path} />)}</g>)}
      </svg><figcaption>{model.side === 'front' ? (es ? 'Frente' : 'Front') : (es ? 'Espalda' : 'Back')}</figcaption>
    </figure>)}</div>
    <p className={`${styles.note} mt-3`}>{es ? 'El color compara sesiones por músculo; no mide recuperación. Una sesión puede trabajar varios grupos.' : 'Color compares sessions per muscle; it does not measure recovery. A session can train several groups.'}</p>
    <div className={styles.muscleList} role="group" aria-label={es ? 'Sesiones por grupo muscular' : 'Sessions per muscle group'}>{MUSCLE_GROUPS.map(m => <button key={m.id} type="button" className={styles.muscleButton} aria-pressed={selected === m.id} aria-label={`${m[es ? 'es' : 'en']}: ${count(m.id)} ${es ? 'sesiones' : 'sessions'}`} onClick={() => setSelected(selected === m.id ? null : m.id)}><span>{m[es ? 'es' : 'en']}</span><b>{count(m.id)}</b></button>)}</div>
    {group && <p className={styles.selectedMuscle} role="status"><strong>{group[es ? 'es' : 'en']}</strong> · {count(group.id)} {es ? 'sesiones registradas' : 'recorded sessions'}{!Object.values(regions).includes(group.id) && (es ? ' · Sin zona propia en el dibujo' : ' · No dedicated drawing region')}</p>}
    <a className={`${styles.note} mt-3 inline-flex min-h-11 items-center underline underline-offset-4`} href="/third-party/MuscleMap-LICENSE.txt" target="_blank" rel="noreferrer">MuscleMap · © Melih Colpan · MIT</a>
  </>
}
