import type { Workspace } from '@/lib/coaching/workspace'

export const WORKSPACE_NAVIGATION_INTENT = 'vekira:workspace-navigation-intent'
export const WORKSPACE_NAVIGATION_COMMIT = 'vekira:workspace-navigation-commit'

export type WorkspaceNavigationIntent = {
  workspace: Workspace
  destination: '/dashboard' | '/coach'
}

export function requestWorkspaceNavigation(intent: WorkspaceNavigationIntent): boolean {
  if (typeof window === 'undefined') return true
  return window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_INTENT, {
    cancelable: true,
    detail: intent,
  }))
}

export function commitWorkspaceNavigation(intent: WorkspaceNavigationIntent): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_COMMIT, {
    detail: intent,
  }))
}
