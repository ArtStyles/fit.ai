export const WORKSPACE_COOKIE = 'vekira_workspace'

export type Workspace = 'personal' | 'coach'

export type WorkspaceDestination = '/dashboard' | '/coach'

export type WorkspaceChangeResult =
  | { ok: true; workspace: Workspace; destination: WorkspaceDestination }
  | {
      ok: false
      code: 'invalid_workspace' | 'coach_unavailable' | 'unexpected'
      error: string
    }

export function workspaceDestination(workspace: Workspace): WorkspaceDestination {
  return workspace === 'coach' ? '/coach' : '/dashboard'
}

/** The preference cookie never grants professional access. */
export function normalizeWorkspace(
  requestedWorkspace: string | undefined,
  hasActiveTrainerProfile: boolean,
): Workspace {
  return requestedWorkspace === 'coach' && hasActiveTrainerProfile ? 'coach' : 'personal'
}
