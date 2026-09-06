import type { ReactNode } from 'react'
import { AccountWorkspaceProvider } from './AccountWorkspaceProvider'
import type { AccountWorkspaceModel } from './AccountWorkspaceContext'
import { AppScrollViewport } from './AppScrollViewport'
import { ActiveWorkoutDock, BottomNav } from './BottomNav'
import { DesktopSidebar } from './DesktopSidebar'

export function AppShell({
  children,
  accountWorkspace,
}: {
  children: ReactNode
  accountWorkspace: AccountWorkspaceModel
}) {
  return (
    <AccountWorkspaceProvider model={accountWorkspace}>
      <div className="fixed bottom-0 left-[var(--app-safe-area-left)] right-[var(--app-safe-area-right)] top-[var(--app-safe-area-top)] flex overflow-hidden">
        <DesktopSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppScrollViewport>
            {children}
            <ActiveWorkoutDock />
          </AppScrollViewport>
          <BottomNav />
        </div>
      </div>
    </AccountWorkspaceProvider>
  )
}
