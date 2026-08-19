'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics/events'

type PricingAnalyticsProps = {
  isAuthenticated: boolean
}

export function PricingAnalytics({ isAuthenticated }: PricingAnalyticsProps) {
  useEffect(() => {
    void trackEvent('paywall_viewed', {
      source: 'pricing',
      screen: 'pricing',
      authenticated: isAuthenticated,
    })
  }, [isAuthenticated])

  return null
}
