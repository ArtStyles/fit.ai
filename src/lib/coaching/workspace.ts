export const WORKSPACE_COOKIE = 'vekira_workspace'

export type Workspace = 'personal' | 'coach'

/** The preference cookie never grants professional access. */
export function normalizeWorkspace(
  requestedWorkspace: string | undefined,
  hasActiveTrainerProfile: boolean,
): Workspace {
  return requestedWorkspace === 'coach' && hasActiveTrainerProfile ? 'coach' : 'personal'
}
