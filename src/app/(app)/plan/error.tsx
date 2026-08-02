'use client'

import { EvidenceRouteError } from '@/components/evidence/EvidenceRouteError'

export default function PlanError({ reset }: { reset: () => void }) {
  return <EvidenceRouteError reset={reset} />
}
