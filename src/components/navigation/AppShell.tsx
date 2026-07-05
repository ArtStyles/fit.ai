import type { ReactNode } from 'react'
import { AppScrollViewport } from './AppScrollViewport'
import { BottomNav } from './BottomNav'
import { DesktopSidebar } from './DesktopSidebar'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed bottom-0 left-[var(--app-safe-area-left)] right-[var(--app-safe-area-right)] top-[var(--app-safe-area-top)] flex overflow-hidden">
      <DesktopSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppScrollViewport>{children}</AppScrollViewport>
        <BottomNav />
      </div>
    </div>
  )
}
