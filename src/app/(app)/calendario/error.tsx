'use client'

import { EvidenceRouteError } from '@/components/evidence/EvidenceRouteError'

export default function CalendarError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EvidenceRouteError reset={reset} />
}
