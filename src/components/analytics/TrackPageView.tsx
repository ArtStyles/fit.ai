'use client'

import { useEffect } from 'react'
import type { PublicLocale } from '@/lib/i18n/routing'
import { trackEvent } from '@/lib/analytics/events'

export function TrackPageView({ locale }: { locale: PublicLocale }) {
  useEffect(() => {
    void trackEvent('landing_view', { locale, screen: 'landing' })

    function handleClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) return
      if (!target.closest('a[href^="/register"]')) return

      void trackEvent('primary_cta_clicked', {
        locale,
        source: 'landing',
        screen: 'landing',
      })
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [locale])

  return null
}
