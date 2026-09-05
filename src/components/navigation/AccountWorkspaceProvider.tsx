'use client'

import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { setWorkspace } from '@/app/actions/workspace'
import { signOut as signOutAction } from '@/app/(auth)/actions'
import {
  AccountWorkspaceContext,
  type AccountWorkspaceContextValue,
  type AccountWorkspaceModel,
  type WorkspaceTransitionOutcome,
} from './AccountWorkspaceContext'
import {
  isImmersiveWorkspaceRoute,
  resolvePresentedWorkspace,
} from './workspacePresentation'
import {
  commitWorkspaceNavigation,
  requestWorkspaceNavigation,
} from './WorkspaceNavigationGuard'
import {
  workspaceDestination,
  type Workspace,
  type WorkspaceChangeResult,
} from '@/lib/coaching/workspace'

type WorkspaceTransitionDependencies = {
  requestIntent: (target: Workspace) => boolean
  commitIntent: (target: Workspace) => void
  action: (formData: FormData) => Promise<WorkspaceChangeResult | undefined>
  replace: (destination: '/dashboard' | '/coach') => void
  refresh: () => void
  setPending: (target: Workspace | null) => void
}

export async function executeWorkspaceTransition(
  target: Workspace,
  current: Workspace,
  dependencies: WorkspaceTransitionDependencies,
): Promise<WorkspaceTransitionOutcome> {
  if (target === current) return { status: 'cancelled' }
  if (!dependencies.requestIntent(target)) return { status: 'cancelled' }
  const formData = new FormData()
  formData.set('workspace', target)
  dependencies.setPending(target)
  try {
    const result = await dependencies.action(formData)
    // Next 14.2 resolves the client proxy with undefined when the Server Action
    // response carries x-action-redirect (for example, an expired session).
    if (result === undefined) return { status: 'redirecting' }
    if (!result.ok) {
      if (result.code === 'coach_unavailable') dependencies.refresh()
      return { status: 'failed', code: result.code, error: result.error }
    }
    dependencies.commitIntent(target)
    dependencies.replace(result.destination)
    dependencies.refresh()
    return { status: 'navigating' }
  } catch {
    return {
      status: 'failed',
      code: 'unexpected',
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    }
  } finally {
    dependencies.setPending(null)
  }
}

export function AccountWorkspaceProvider({
  model,
  children,
}: {
  model: AccountWorkspaceModel
  children: ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const transitionInFlight = useRef(false)
  const [pendingWorkspace, setPendingWorkspace] = useState<Workspace | null>(null)
  const [error, setError] = useState<string | null>(null)
  const presentedWorkspace = resolvePresentedWorkspace({
    pathname,
    preferredWorkspace: model.preferredWorkspace,
    trainerAccess: model.trainerAccess,
  })
  const immersiveRoute = isImmersiveWorkspaceRoute(pathname)
  const navItems = presentedWorkspace === 'coach'
    ? model.coachNavItems
    : model.personalNavItems

  const value = useMemo<AccountWorkspaceContextValue>(() => ({
    ...model,
    presentedWorkspace,
    immersiveRoute,
    navItems,
    pendingWorkspace,
    error,
    clearError: () => setError(null),
    signOutAccount: async () => { await signOutAction() },
    changeWorkspace: async target => {
      if (transitionInFlight.current || target === presentedWorkspace) {
        return { status: 'cancelled' }
      }
      transitionInFlight.current = true
      setError(null)
      try {
        const outcome = await executeWorkspaceTransition(target, presentedWorkspace, {
          requestIntent: requested => requestWorkspaceNavigation({
            workspace: requested,
            destination: workspaceDestination(requested),
          }),
          commitIntent: committed => commitWorkspaceNavigation({
            workspace: committed,
            destination: workspaceDestination(committed),
          }),
          action: setWorkspace,
          replace: destination => router.replace(destination),
          refresh: () => router.refresh(),
          setPending: setPendingWorkspace,
        })
        if (outcome.status === 'failed') setError(outcome.error)
        return outcome
      } finally {
        transitionInFlight.current = false
      }
    },
  }), [error, immersiveRoute, model, navItems, pendingWorkspace, presentedWorkspace, router])

  return (
    <AccountWorkspaceContext.Provider value={value}>
      {children}
    </AccountWorkspaceContext.Provider>
  )
}
