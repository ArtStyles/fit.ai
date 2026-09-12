'use client'

import { ArrowUpRight, Dumbbell, ImageIcon, ScanLine, ShieldCheck } from 'lucide-react'
import { VekiraMark } from '@/components/branding/VekiraLogo'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { FitnessCover } from '@/lib/fitness-card/types'
import styles from './fitness-card.module.css'

export function FitnessCardCover({ card, onClick, compact = false }: { card: FitnessCover; onClick?: () => void; compact?: boolean }) {
  const { language } = useI18n()
  const es = language === 'es'
  const name = card.artisticName || card.owner.name || (es ? 'Tu historia' : 'Your story')
  const content = <div className={styles.coverSurface}>
    <div className={styles.coverDiagonal} aria-hidden="true" />
    <div className={styles.coverTop}>
      <div className={styles.coverBrand}>
        <VekiraMark className={styles.coverMark} />
        <div className={styles.wordmark}>VEKIRA<span>FITNESS CARD</span></div>
      </div>
      <div className={styles.coverMotto}>{es ? <>ENTRENA<br />PROGRESA<br />COMPARTE</> : <>TRAIN<br />PROGRESS<br />SHARE</>}</div>
    </div>
    <div className={styles.coverIdentity}>
      <div className={styles.coverPortrait}>
        {card.owner.avatarUrl ? <img src={card.owner.avatarUrl} alt="" /> : <span>{card.owner.name.trim().slice(0, 1).toUpperCase() || 'V'}</span>}
      </div>
      <div className={styles.coverIdentityText}>
        <div className={styles.coverName}>{name}</div>
        {card.artisticName && <div className={styles.realName}>{card.owner.name}</div>}
        <span className={styles.identityRule} aria-hidden="true" />
        <div className={styles.handle}>{card.owner.username ? `@${card.owner.username}` : (es ? 'Tu identidad fitness' : 'Your fitness identity')}</div>
      </div>
    </div>
    <div className={styles.coverStatement} aria-hidden="true">{es ? <>TU<br />MEJOR<br />VERSIÓN.</> : <>YOUR<br />BEST<br />SELF.</>}</div>
    <div className={styles.coverFooter}>
      <div className={styles.coverFeatures}>
        <span><Dumbbell aria-hidden="true" /><span>{es ? 'MARCAS' : 'RECORDS'}</span></span>
        <span><ScanLine aria-hidden="true" /><span>{es ? 'MAPA' : 'MAP'}</span></span>
        <span><ImageIcon aria-hidden="true" /><span>{es ? 'FOTOS' : 'PHOTOS'}</span></span>
      </div>
      <span className={styles.coverAccess}>{onClick ? <><ArrowUpRight aria-hidden="true" /><span>{es ? 'VER CARD' : 'VIEW CARD'}</span></> : <><ShieldCheck aria-hidden="true" /><span>{es ? 'PRIVADA' : 'PRIVATE'}</span></>}</span>
    </div>
  </div>
  const className = `${styles.cover} ${compact ? styles.compactCover : ''} ${name.length > 32 ? styles.longNameCover : ''}`
  return onClick
    ? <button type="button" className={className} data-fitness-card-cover data-theme={card.theme} onClick={onClick} aria-label={`${es ? 'Abrir tarjeta de' : 'Open card for'} ${card.owner.name}`}>{content}</button>
    : <div className={className} data-fitness-card-cover data-theme={card.theme}>{content}</div>
}
