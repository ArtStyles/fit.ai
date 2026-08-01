'use client'

import { EvidenceRouteError } from '@/components/evidence/EvidenceRouteError'

export default function ProgressError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <EvidenceRouteError reset={reset} />
}
