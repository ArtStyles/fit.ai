'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, Dumbbell, ImageIcon, RotateCcw, ScanLine, ShieldCheck } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { VekiraMark } from '@/components/branding/VekiraLogo'
import { useI18n } from '@/components/i18n/I18nProvider'
import { buildFitnessCardLink } from '@/lib/fitness-card/sharing'
import type { FitnessCover } from '@/lib/fitness-card/types'
import { FitnessSocialIcons } from './FitnessSocialIcons'
import styles from './fitness-card.module.css'

export function FitnessCardCover({ card, onClick, compact = false, shareEnabled = true }: { card: FitnessCover; onClick?: () => void; compact?: boolean; shareEnabled?: boolean }) {
  const { language } = useI18n()
  const es = language === 'es'
  const [flipped, setFlipped] = useState(false)
  const frontButton = useRef<HTMLButtonElement>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const interacted = useRef(false)
  const name = card.artisticName || card.owner.name || (es ? 'Tu historia' : 'Your story')
  const canShare = shareEnabled && !!card.owner.username
  useEffect(() => { setFlipped(false); interacted.current = false }, [card.owner.userId, canShare])
  useLayoutEffect(() => { if (interacted.current) (flipped ? backButton : frontButton).current?.focus({ preventScroll: true }) }, [flipped])
  const flip = (next: boolean) => { interacted.current = true; setFlipped(next) }
  const className = `${styles.cover} ${compact ? styles.compactCover : ''} ${name.length > 32 ? styles.longNameCover : ''}`
  return <div className={className} data-fitness-card-cover data-theme={card.theme} data-flipped={flipped}>
    <div className={styles.coverFaces}>
      <div className={`${styles.coverFace} ${styles.coverFront}`} data-inactive={flipped} inert={flipped} aria-hidden={flipped} data-fitness-card-face="front">
        <div className={styles.coverSurface}>
          <div className={styles.coverDiagonal} aria-hidden="true" />
          {canShare && <button type="button" className={styles.coverTap} aria-label={`${es ? 'Ver reverso de la tarjeta de' : 'View reverse of the card for'} ${card.owner.name}`} onClick={() => flip(true)} />}
          <div className={styles.coverTop}>
            <div className={styles.coverBrand}><VekiraMark className={styles.coverMark} /><div className={styles.wordmark}>VEKIRA<span>FITNESS CARD</span></div></div>
            <div className={styles.coverMotto}>{es ? <>ENTRENA<br />PROGRESA<br />COMPARTE</> : <>TRAIN<br />PROGRESS<br />SHARE</>}</div>
          </div>
          <div className={styles.coverIdentity}>
            <div className={styles.coverPortrait}>{card.owner.avatarUrl ? <img src={card.owner.avatarUrl} alt="" /> : <span>{card.owner.name.trim().slice(0, 1).toUpperCase() || 'V'}</span>}</div>
            <div className={styles.coverIdentityText}>
              <div className={styles.coverName}>{name}</div>
              {card.artisticName && <div className={styles.realName}>{card.owner.name}</div>}
              <span className={styles.identityRule} aria-hidden="true" />
              <div className={styles.handle}>{card.owner.username ? `@${card.owner.username}` : (es ? 'Tu identidad fitness' : 'Your fitness identity')}</div>
              <FitnessSocialIcons links={card.socialLinks} name={card.owner.name} />
            </div>
          </div>
          <div className={styles.coverStatement} aria-hidden="true">{es ? <>TU<br />MEJOR<br />VERSIÓN.</> : <>YOUR<br />BEST<br />SELF.</>}</div>
          <div className={styles.coverFooter}>
            <div className={styles.coverFeatures}>
              <span><Dumbbell aria-hidden="true" /><span>{es ? 'MARCAS' : 'RECORDS'}</span></span>
              <span><ScanLine aria-hidden="true" /><span>{es ? 'MAPA' : 'MAP'}</span></span>
              <span><ImageIcon aria-hidden="true" /><span>{es ? 'FOTOS' : 'PHOTOS'}</span></span>
            </div>
            <span className={styles.coverAccess}><ShieldCheck aria-hidden="true" /><span>{es ? 'PRIVADA' : 'PRIVATE'}</span></span>
          </div>
          {(canShare || onClick) && <div className={styles.coverControls}>
            {canShare && <button ref={frontButton} type="button" className={styles.coverControl} onClick={() => flip(true)}><RotateCcw size={15} aria-hidden="true" /><span>{es ? 'Girar · Ver QR' : 'Flip · View QR'}</span></button>}
            {onClick && <button type="button" className={styles.coverControl} onClick={onClick} aria-label={`${es ? 'Abrir tarjeta de' : 'Open card for'} ${card.owner.name}`}><span>{es ? 'Ver contenido' : 'View content'}</span><ArrowUpRight size={15} aria-hidden="true" /></button>}
          </div>}
        </div>
      </div>
      <div className={`${styles.coverFace} ${styles.coverBack}`} data-inactive={!flipped} inert={!flipped} aria-hidden={!flipped} data-fitness-card-face="back">
        <div className={`${styles.coverSurface} ${styles.coverBackSurface}`}>
          <div className={styles.coverDiagonal} aria-hidden="true" />
          <button type="button" className={styles.coverTap} aria-label={`${es ? 'Volver al frente de la tarjeta de' : 'Return to the front of the card for'} ${card.owner.name}`} onClick={() => flip(false)} />
          <div className={styles.coverBackBrand}><VekiraMark className={styles.coverMark} /><span>VEKIRA / FITNESS CARD</span></div>
          <div className={styles.coverQrLayout}>
            <div className={styles.coverQr}>{canShare && <QRCodeSVG value={buildFitnessCardLink(card.owner.userId)} size={176} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" role="img" aria-label={`${es ? 'QR para solicitar acceso a la tarjeta de' : 'QR to request access to the card for'} ${card.owner.name}`} />}</div>
            <div className={styles.coverBackCopy}><div className={styles.coverBackHandle}>@{card.owner.username}</div><h3>{es ? 'Escanea en Vekira para solicitar acceso' : 'Scan in Vekira to request access'}</h3><p>{es ? 'La persona decide quién puede ver su tarjeta.' : 'The owner decides who can view their card.'}</p></div>
          </div>
          <div className={styles.coverControls}><button ref={backButton} type="button" className={styles.coverControl} onClick={() => flip(false)}><RotateCcw size={15} aria-hidden="true" /><span>{es ? 'Volver al frente' : 'Back to front'}</span></button>{onClick && <button type="button" className={styles.coverControl} onClick={onClick}><span>{es ? 'Ver contenido' : 'View content'}</span><ArrowUpRight size={15} aria-hidden="true" /></button>}</div>
        </div>
      </div>
    </div>
  </div>
}
