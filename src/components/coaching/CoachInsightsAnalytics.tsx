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

/** Stable aggregate identity prevents equivalent parent prop objects from
 * recording duplicate views while retaining meaningful count/period changes. */
export function coachInsightsViewKey(props: CoachInsightsAnalyticsProps): string {
  if (props.kind === 'overview') {
    return `overview:${props.counts.activeClients}:${props.counts.pendingRequests}:${props.counts.pausedRelationships}`
  }
  return `client-insights:${props.weeks}:${props.prescribedSessionCount}:${props.evidenceSessionCount}`
}

/** Sends only aggregate interaction metrics; client and relationship identifiers never enter analytics. */
export function CoachInsightsAnalytics(props: CoachInsightsAnalyticsProps) {
  const viewKey = coachInsightsViewKey(props)
  const isOverview = props.kind === 'overview'
  const activeClientCount = isOverview ? props.counts.activeClients : null
  const pendingRequestCount = isOverview ? props.counts.pendingRequests : null
  const pausedRelationshipCount = isOverview ? props.counts.pausedRelationships : null
  const periodWeeks = !isOverview ? props.weeks : null
  const prescribedSessionCount = !isOverview ? props.prescribedSessionCount : null
  const evidenceSessionCount = !isOverview ? props.evidenceSessionCount : null

  useEffect(() => {
    if (isOverview) {
      if (activeClientCount === null || pendingRequestCount === null || pausedRelationshipCount === null) return
      void trackEvent('coach_overview_viewed', {
        active_client_count: activeClientCount,
        pending_request_count: pendingRequestCount,
        paused_relationship_count: pausedRelationshipCount,
      })
      return
    }

    if (periodWeeks === null || prescribedSessionCount === null || evidenceSessionCount === null) return
    void trackEvent('coach_client_insights_viewed', {
      period_weeks: periodWeeks,
      prescribed_session_count: prescribedSessionCount,
      evidence_session_count: evidenceSessionCount,
    })
  }, [
    viewKey,
    isOverview,
    activeClientCount,
    pendingRequestCount,
    pausedRelationshipCount,
    evidenceSessionCount,
    prescribedSessionCount,
    periodWeeks,
  ])

  return null
}
