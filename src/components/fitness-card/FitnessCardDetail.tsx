'use client'

import { useState } from 'react'
import { Activity, Dumbbell, ImageIcon, ScanLine } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import type { FitnessCard, FitnessPhotoUrls } from '@/lib/fitness-card/types'
import { FitnessCardCover } from './FitnessCardCover'
import { FitnessCardMuscles } from './FitnessCardMuscles'
import styles from './fitness-card.module.css'

export function FitnessCardDetail({ card, photoUrls, shareEnabled = true }: { card: FitnessCard; photoUrls: FitnessPhotoUrls; shareEnabled?: boolean }) {
  const { language } = useI18n()
  const es = language === 'es'
  const [photo, setPhoto] = useState<1 | 2 | 3 | null>(null)
  const date = (value: string) => { const d = new Date(value.slice(0, 10) + 'T12:00:00'); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(es ? 'es' : 'en', {day:'numeric', month:'short', year:'numeric'}) }
  return <div className={styles.detail}>
    <FitnessCardCover card={card} shareEnabled={shareEnabled} />
    <Tabs defaultValue="records"><TabsList className={styles.tabs} aria-label={es ? 'Contenido de la tarjeta' : 'Card content'}>
      <TabsTrigger value="records" className={styles.tab}><Dumbbell size={15} />{es ? 'Marcas' : 'Records'}</TabsTrigger>
      <TabsTrigger value="muscles" className={styles.tab}><ScanLine size={15} />{es ? 'Mapa' : 'Map'}</TabsTrigger>
      <TabsTrigger value="photos" className={styles.tab}><ImageIcon size={15} />{es ? 'Fotos' : 'Photos'}</TabsTrigger>
    </TabsList>
    <TabsContent value="records">
      <div className={styles.intro}><div><p className={styles.eyebrow}>{es ? 'Historial registrado' : 'Recorded history'}</p><h3 className={styles.title}>{es ? 'El esfuerzo deja huella.' : 'Effort leaves a mark.'}</h3></div></div>
      <p className={`${styles.note} mb-4`}>{es ? 'Mejores series de tu historial.' : 'Best sets from your training history.'}</p>
      {card.evidence.records.length ? <div className={styles.records}>{card.evidence.records.map(record => <article key={record.exerciseId} className={styles.record}><div className="min-w-0"><h4 className={styles.recordName}>{record.name}</h4><p className={styles.note}>{date(record.date)}</p></div><div className={styles.recordValue}>{record.kind === 'duration' ? <>{record.seconds}<span className={styles.unit}> s</span></> : record.weightKg === 0 ? <>{record.reps}<span className={styles.unit}> reps</span><div className={styles.unit}>{es ? 'Peso corporal' : 'Bodyweight'}</div></> : <>{record.weightKg}<span className={styles.unit}> kg</span><div className={styles.unit}>× {record.reps} reps</div></>}</div></article>)}</div> : <div className={styles.empty}><Dumbbell size={30} strokeWidth={1.4} /><strong>{es ? 'La primera marca empieza contigo.' : 'Your first record starts with you.'}</strong><p className={styles.note}>{es ? 'Las series completadas con carga y repeticiones o duración aparecerán aquí.' : 'Completed sets with load and reps or duration will appear here.'}</p></div>}
      <details className={styles.calculation}><summary>{es ? 'Cómo se calculan' : 'How records are calculated'}</summary><p>{es ? 'Se muestra la mejor serie registrada por ejercicio de todo tu historial: mayor carga y, en empate, más repeticiones; o mayor duración. Carga y repeticiones pertenecen a la misma serie. Una carga registrada de 0 kg se muestra como peso corporal. El mapa usa solo las últimas 12 semanas.' : 'The best recorded set per exercise across your full history is shown: highest load, then most reps on a tie; or longest duration. Load and reps belong to the same set. A recorded load of 0 kg is shown as bodyweight. The map uses only the last 12 weeks.'}</p></details>
    </TabsContent>
    <TabsContent value="muscles"><div className={styles.intro}><div><p className={styles.eyebrow}>{es ? 'Últimas 12 semanas' : 'Last 12 weeks'}</p><h3 className={styles.title}>{es ? 'Tu constancia, por zonas.' : 'Your consistency, mapped.'}</h3><p className={`${styles.note} mt-2`}>{date(card.evidence.rangeFrom)} — {date(card.evidence.rangeTo)}</p></div><Activity className="shrink-0 text-violet-500" size={26} /></div>
      <p className={`${styles.note} mb-4`}>{card.evidence.totalSessions} {es ? 'sesiones completadas en este período.' : 'completed sessions in this period.'}</p><FitnessCardMuscles evidence={card.evidence} />
      {card.evidence.partialSessions > 0 && <p className={styles.note}>{es ? `${card.evidence.partialSessions} sesiones tienen datos parciales. Solo se cuentan los músculos documentados; registrar asistencia no añade músculos.` : `${card.evidence.partialSessions} sessions have partial data. Only documented muscles count; attendance alone adds no muscles.`}</p>}
    </TabsContent>
    <TabsContent value="photos"><div className={styles.intro}><div><p className={styles.eyebrow}>{es ? 'Tres momentos, tu elección' : 'Three moments, your choice'}</p><h3 className={styles.title}>{es ? 'Más allá de los números.' : 'Beyond the numbers.'}</h3></div></div><div className={styles.photos}>{([1,2,3] as const).map(slot => photoUrls[slot] ? <button key={slot} type="button" className={styles.photo} onClick={() => setPhoto(slot)} aria-label={`${es ? 'Ampliar foto' : 'Enlarge photo'} ${slot}`}><img src={photoUrls[slot]} alt={`${es ? 'Foto seleccionada por' : 'Photo selected by'} ${card.owner.name}, ${slot}`} /><span className={styles.photoNumber}>0{slot}</span></button> : <div key={slot} className={styles.photo}><span className={styles.photoEmpty}><ImageIcon size={22} strokeWidth={1.2} />{es ? 'Sin foto' : 'No photo'} 0{slot}</span></div>)}</div></TabsContent>
    </Tabs>
    <Dialog open={photo !== null && !!photoUrls[photo]} onOpenChange={open => { if (!open) setPhoto(null) }}><DialogContent className="max-w-4xl" closeLabel={es ? 'Cerrar' : 'Close'}><DialogTitle className="pr-12">{es ? 'Foto' : 'Photo'} {photo}</DialogTitle><DialogDescription className="sr-only">{card.owner.name}</DialogDescription>{photo && photoUrls[photo] && <img src={photoUrls[photo]} alt={`${es ? 'Foto de' : 'Photo of'} ${card.owner.name}`} className="mt-5 max-h-[75dvh] w-full rounded-xl object-contain" />}</DialogContent></Dialog>
  </div>
}
