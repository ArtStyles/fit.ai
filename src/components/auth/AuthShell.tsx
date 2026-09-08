import type { ReactNode } from 'react'
import Link from 'next/link'
import { VekiraLogo } from '@/components/branding/VekiraLogo'

type AuthShellProps = {
  children: ReactNode
  aside: ReactNode
  homeHref?: string
  homeLabel?: string
}

export function AuthShell({
  children, aside, homeHref = '/', homeLabel = 'Ir al inicio',
}: AuthShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-[var(--app-safe-area-bottom)]">
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-start gap-12 px-5 py-9 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
        <main id="app-main-content" className="mx-auto w-full min-w-0 max-w-md scroll-mt-6 [overflow-wrap:anywhere]" tabIndex={-1}>
          <Link href={homeHref} aria-label={homeLabel} className="mb-9 inline-flex min-h-11 max-w-full items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
            <VekiraLogo />
          </Link>
          {children}
        </main>
        <aside className="hidden min-w-0 rounded-3xl border border-violet-400/15 bg-gradient-to-br from-violet-500/10 via-surface-1 to-surface-1 p-8 lg:block xl:p-10">
          {aside}
        </aside>
      </div>
    </div>
  )
}
