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
    // Keep scrolling inside the system insets. A full-height document child
    // adds the body's top inset a second time and scrolls under the status bar.
    // `contain` keeps local overscroll feedback while preventing scroll chaining.
    <div
      data-auth-scroll-viewport
      className="fixed bottom-[var(--app-safe-area-bottom)] left-[var(--app-safe-area-left)] right-[var(--app-safe-area-right)] top-[var(--app-safe-area-top)] overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background"
    >
      <div className="mx-auto grid min-h-full w-full max-w-6xl items-start gap-12 px-5 py-9 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-16">
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
