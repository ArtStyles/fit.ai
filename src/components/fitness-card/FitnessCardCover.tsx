'use client'

import { ArrowUpRight, Fingerprint } from 'lucide-react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { FitnessCover } from '@/lib/fitness-card/types'
import styles from './fitness-card.module.css'

export function FitnessCardCover({ card, onClick, compact = false }: { card: FitnessCover; onClick?: () => void; compact?: boolean }) {
  const { language } = useI18n()
  const es = language === 'es'
  const content = <>
    <div className={styles.coverGrid} aria-hidden="true" />
    <div className={styles.coverOrbit} aria-hidden="true"><span /><span /><span /></div>
    <div className={styles.coverTop}><span className={styles.wordmark}>VEKIRA<span> / </span>FITNESS CARD</span><Fingerprint size={25} strokeWidth={1.3} aria-hidden="true" /></div>
    <div className={styles.coverIdentity}>
      <div className={styles.avatar}>{card.owner.avatarUrl ? <img src={card.owner.avatarUrl} alt="" /> : <span>{card.owner.name.trim().slice(0, 1).toUpperCase() || 'V'}</span>}</div>
      <div className={styles.handle}>{card.owner.username ? `@${card.owner.username}` : (es ? 'Tu identidad fitness' : 'Your fitness identity')}</div>
      <div className={styles.coverName}>{card.artisticName || card.owner.name || (es ? 'Tu historia' : 'Your story')}</div>
      {card.artisticName && <div className={styles.realName}>{card.owner.name}</div>}
    </div>
    <div className={styles.coverFooter}><span>{es ? 'TU ESFUERZO. TU IDENTIDAD.' : 'YOUR EFFORT. YOUR IDENTITY.'}</span>{onClick ? <ArrowUpRight size={20} aria-hidden="true" /> : <span className={styles.coverBars} aria-hidden="true" />}</div>
  </>
  const className = `${styles.cover} ${compact ? styles.compactCover : ''} ${(card.artisticName || card.owner.name || '').length > 32 ? styles.longNameCover : ''}`
  return onClick ? <button type="button" className={className} data-theme={card.theme} onClick={onClick} aria-label={`${es ? 'Abrir tarjeta de' : 'Open card for'} ${card.owner.name}`}>{content}</button> : <div className={className} data-theme={card.theme}>{content}</div>
}
