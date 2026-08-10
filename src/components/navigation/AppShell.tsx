import type { ReactNode } from 'react'
import { AppScrollViewport } from './AppScrollViewport'
import { BottomNav } from './BottomNav'
import { DesktopSidebar } from './DesktopSidebar'
import type { AppNavItem } from './appNavigation'
import type { Workspace } from '@/lib/coaching/workspace'

export function AppShell({ children, navItems, workspace }: {
  children: ReactNode
  navItems: readonly AppNavItem[]
  workspace?: Workspace
}) {
  return (
    <div className="fixed bottom-0 left-[var(--app-safe-area-left)] right-[var(--app-safe-area-right)] top-[var(--app-safe-area-top)] flex overflow-hidden">
      <DesktopSidebar navItems={navItems} workspace={workspace} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppScrollViewport>{children}</AppScrollViewport>
        <BottomNav navItems={navItems} workspace={workspace} />
      </div>
    </div>
  )
}
