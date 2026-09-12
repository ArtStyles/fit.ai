'use client'

import { Layers3 } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { FitnessCover } from '@/lib/fitness-card/types'
import { FitnessCardCover } from './FitnessCardCover'
import styles from './fitness-card.module.css'

export function FitnessCardCollection({ cards, onOpen }: { cards: FitnessCover[]; onOpen: (ownerId: string) => void }) {
  const { language } = useI18n()
  const es = language === 'es'
  return cards.length ? <div className={styles.collection}>{cards.map(card => <FitnessCardCover key={card.owner.userId} card={card} compact onClick={() => onOpen(card.owner.userId)} />)}</div> : <div className={styles.empty}><Layers3 size={35} strokeWidth={1.3} /><strong>{es ? 'Entrenar también conecta.' : 'Training brings people together.'}</strong><p className={styles.note}>{es ? 'Aquí viven las tarjetas que tus compañeros comparten contigo. Solicita una desde Accesos usando su @usuario.' : 'Cards shared by your training companions live here. Request one in Access using their @username.'}</p></div>
}
