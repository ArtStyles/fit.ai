'use client'

import { useState } from 'react'
import { PendingLink } from '@/components/navigation/PendingLink'
import { Button } from '@/components/ui/button'
import { trackEvent, trackEventConfirmed } from '@/lib/analytics/events'

type ProInterestCtaProps = {
  isAuthenticated: boolean
}

function trackProInterest(authenticated: boolean) {
  void trackEvent('pro_interest_submitted', {
    source: 'pricing',
    screen: 'pricing',
    authenticated,
  })
}

export function ProInterestCta({ isAuthenticated }: ProInterestCtaProps) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')

  if (!isAuthenticated) {
    return (
      <PendingLink
        href="/register?plan=pro-early-access"
        onClick={() => trackProInterest(false)}
        aria-describedby="pro-availability"
        className="inline-flex h-12 min-w-52 items-center justify-center rounded-md bg-violet-600 px-6 text-sm font-bold text-white ring-offset-background transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Quiero acceso Pro
      </PendingLink>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        aria-describedby="pro-availability"
        disabled={status === 'submitting' || status === 'submitted'}
        onClick={async () => {
          if (status === 'submitting' || status === 'submitted') return
          setStatus('submitting')
          const accepted = await trackEventConfirmed('pro_interest_submitted', {
            source: 'pricing',
            screen: 'pricing',
            authenticated: true,
          })
          setStatus(accepted ? 'submitted' : 'error')
        }}
        className="h-12 min-w-52 bg-violet-600 px-6 font-bold text-white hover:bg-violet-700 disabled:opacity-70"
      >
        {status === 'submitting' ? 'Registrando…' : 'Quiero acceso Pro'}
      </Button>
      {status === 'submitted' ? (
        <p className="text-center text-xs text-muted-foreground" role="status">
          Interés registrado para la beta Pro.
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="text-center text-xs text-destructive" role="alert">
          No pudimos registrar tu interés. Intenta de nuevo.
        </p>
      ) : null}
    </div>
  )
}
