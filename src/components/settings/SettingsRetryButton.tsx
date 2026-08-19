'use client'

import { useRouter } from 'next/navigation'

export function refreshSettingsRoute(router: { refresh: () => void }) {
  router.refresh()
}

export function SettingsRetryButton({ label, ariaLabel }: { label: string; ariaLabel: string }) {
  const router = useRouter()

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => refreshSettingsRoute(router)}
      className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-border/60 px-3 text-sm font-semibold text-foreground hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    >
      {label}
    </button>
  )
}
