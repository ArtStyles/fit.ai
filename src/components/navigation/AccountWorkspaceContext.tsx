'use client'

import { createContext, useContext } from 'react'
import type { AppNavItem } from './appNavigation'
import type { Workspace } from '@/lib/coaching/workspace'

export type TrainerAccessSummary =
  | { granted: true }
  | { granted: false; reason: 'missing_profile' | 'suspended' | 'inactive' }

export type AccountWorkspaceModel = {
  account: {
    name: string | null
    email: string
    avatarUrl: string | null
  }
  trainerAccess: TrainerAccessSummary
  preferredWorkspace: Workspace
  personalNavItems: readonly AppNavItem[]
  coachNavItems: readonly AppNavItem[]
}

export type WorkspaceTransitionOutcome =
  | { status: 'cancelled' | 'navigating' | 'redirecting' }
  | {
      status: 'failed'
      code: 'invalid_workspace' | 'coach_unavailable' | 'unexpected'
      error: string
    }

export type AccountWorkspaceContextValue = AccountWorkspaceModel & {
  presentedWorkspace: Workspace
  immersiveRoute: boolean
  navItems: readonly AppNavItem[]
  pendingWorkspace: Workspace | null
  error: string | null
  clearError: () => void
  changeWorkspace: (target: Workspace) => Promise<WorkspaceTransitionOutcome>
  signOutAccount: () => Promise<void>
}

export const AccountWorkspaceContext = createContext<AccountWorkspaceContextValue | null>(null)

export function useAccountWorkspace(): AccountWorkspaceContextValue {
  const value = useContext(AccountWorkspaceContext)
  if (!value) throw new Error('useAccountWorkspace must be used within AccountWorkspaceProvider')
  return value
}

export function useOptionalAccountWorkspace(): AccountWorkspaceContextValue | null {
  return useContext(AccountWorkspaceContext)
}
