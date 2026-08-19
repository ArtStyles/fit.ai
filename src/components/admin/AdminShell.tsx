import type React from 'react'
import { AdminDesktopSidebar } from './AdminDesktopSidebar'
import { AdminMobileHeader, AdminMobileNav } from './AdminMobileNav'

type AdminShellProps = {
  children: React.ReactNode
  adminLabel: string
  pendingTrainerCount?: number
}

export function AdminShell({ children, adminLabel, pendingTrainerCount }: AdminShellProps) {
  return (
    <div className="fixed bottom-0 left-[var(--app-safe-area-left)] right-[var(--app-safe-area-right)] top-[var(--app-safe-area-top)] flex overflow-hidden bg-background">
      <AdminDesktopSidebar pendingTrainerCount={pendingTrainerCount} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminMobileHeader adminLabel={adminLabel} />
        <div id="app-main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-none">
          {children}
        </div>
        <AdminMobileNav pendingTrainerCount={pendingTrainerCount} />
      </div>
    </div>
  )
}
