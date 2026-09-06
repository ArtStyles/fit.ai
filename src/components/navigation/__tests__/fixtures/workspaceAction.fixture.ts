export async function setWorkspace(formData: FormData) {
  const query = new URLSearchParams(window.location.search)
  const delay = Number(query.get('delay') || 0)
  if (delay > 0) await new Promise(resolve => window.setTimeout(resolve, delay))
  const workspace = formData.get('workspace')
  const state = window as Window & { __WORKSPACE_ACTIONS__?: string[] }
  state.__WORKSPACE_ACTIONS__ ??= []
  state.__WORKSPACE_ACTIONS__.push(String(workspace))
  if (query.get('outcome') === 'network') throw new Error('offline')
  if (query.get('outcome') === 'redirect') return undefined
  if (query.get('outcome') === 'invalid') {
    return {
      ok: false as const,
      code: 'invalid_workspace' as const,
      error: 'El espacio solicitado no es v\u00e1lido.',
    }
  }
  if (query.get('outcome') === 'unavailable') {
    return {
      ok: false as const,
      code: 'coach_unavailable' as const,
      error: 'El espacio de entrenador ya no est\u00e1 disponible.',
    }
  }
  if (workspace !== 'personal' && workspace !== 'coach') {
    return {
      ok: false as const,
      code: 'invalid_workspace' as const,
      error: 'El espacio solicitado no es v\u00e1lido.',
    }
  }
  return {
    ok: true as const,
    workspace,
    destination: workspace === 'coach' ? '/coach' as const : '/dashboard' as const,
  }
}

export async function signOut() {
  const state = window as Window & { __SIGN_OUTS__?: number }
  state.__SIGN_OUTS__ = (state.__SIGN_OUTS__ ?? 0) + 1
}

export async function releaseSessionAuthorization() {
  return { success: true as const }
}
