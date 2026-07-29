'use client'

import {
  useEffect,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { PullToRefreshPhase } from './pull-to-refresh.logic'

export type PullToRefreshIndicatorProps = {
  phase: PullToRefreshPhase
  progress: number
  visualDistance: number
  reducedMotion: boolean
  completionPulse: boolean
}

type IndicatorStyle = CSSProperties & {
  '--ptr-progress': string
  '--ptr-distance': string
  '--ptr-scale': string
}

export function PullToRefreshIndicatorContent({
  phase,
  progress,
  visualDistance,
  reducedMotion,
  completionPulse,
}: PullToRefreshIndicatorProps) {
  const { t } = useI18n()

  if (phase === 'idle') return null

  const style: IndicatorStyle = {
    '--ptr-progress': String(progress),
    '--ptr-distance': `${visualDistance}px`,
    '--ptr-scale': String(0.74 + progress * 0.26),
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-pull-refresh-phase={phase}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-completion-pulse={completionPulse ? 'true' : 'false'}
      className="vekira-ptr-indicator"
      style={style}
    >
      <div className="vekira-ptr-energy" aria-hidden="true">
        <span className="vekira-ptr-wave" />
        <span className="vekira-ptr-wave vekira-ptr-wave-delay" />
        <svg
          viewBox="0 0 512 512"
          className="vekira-ptr-mark"
          focusable="false"
        >
          <defs>
            <linearGradient
              id="vekira-ptr-gradient"
              x1="90"
              y1="70"
              x2="415"
              y2="450"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#ddd6fe" />
              <stop offset=".48" stopColor="#a78bfa" />
              <stop offset="1" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
          <path d="M86 86h82l126 352h-84L86 86Z" fill="url(#vekira-ptr-gradient)" />
          <path
            d="m308 438-78-138 85-108-38-27 162-76-12 178-42-30-72 82 67 119h-72Z"
            fill="url(#vekira-ptr-gradient)"
          />
        </svg>
      </div>
      <span className="sr-only">
        {phase === 'refreshing' ? t('Actualizando contenido') : ''}
      </span>
    </div>
  )
}

export function PullToRefreshIndicator(props: PullToRefreshIndicatorProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setPortalTarget(document.body)
  }, [])

  if (!portalTarget) return null
  return createPortal(<PullToRefreshIndicatorContent {...props} />, portalTarget)
}
