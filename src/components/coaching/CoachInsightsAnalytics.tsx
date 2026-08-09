'use client'

import { useEffect } from 'react'
import { trackEvent } from '@/lib/analytics/events'

type CoachOverviewAnalyticsProps = {
  kind: 'overview'
  counts: { activeClients: number; pendingRequests: number; pausedRelationships: number }
}

type ClientInsightsAnalyticsProps = {
  kind: 'client-insights'
  weeks: 4 | 12
  prescribedSessionCount: number
  evidenceSessionCount: number
  measurementsShared: boolean
}

type CoachInsightsAnalyticsProps = CoachOverviewAnalyticsProps | ClientInsightsAnalyticsProps

/** Sends only aggregate interaction metrics; client and relationship identifiers never enter analytics. */
export function CoachInsightsAnalytics(props: CoachInsightsAnalyticsProps) {
  useEffect(() => {
    if (props.kind === 'overview') {
      void trackEvent('coach_overview_viewed', {
        active_client_count: props.counts.activeClients,
        pending_request_count: props.counts.pendingRequests,
        paused_relationship_count: props.counts.pausedRelationships,
      })
      return
    }

    void trackEvent('coach_client_insights_viewed', {
      period_weeks: props.weeks,
      prescribed_session_count: props.prescribedSessionCount,
      evidence_session_count: props.evidenceSessionCount,
      measurements_shared: props.measurementsShared,
    })
  }, [props])

  return null
}
