export async function setWorkspace(formData: FormData) {
  const state = window as Window & { __WORKSPACE_ACTIONS__?: FormData[] }
  state.__WORKSPACE_ACTIONS__ ??= []
  state.__WORKSPACE_ACTIONS__.push(formData)
  if (new URLSearchParams(window.location.search).get('workspace') === 'error') {
    return {
      ok: false as const,
      code: 'unexpected' as const,
      error: 'No se pudo cambiar de espacio. Inténtalo nuevamente.',
    }
  }
  const workspace = formData.get('workspace')
  if (workspace !== 'personal' && workspace !== 'coach') {
    return {
      ok: false as const,
      code: 'invalid_workspace' as const,
      error: 'El espacio solicitado no es válido.',
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
