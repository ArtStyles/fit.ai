function result(name: 'request' | 'cancel') {
  const mode = new URLSearchParams(window.location.search).get(name)
  return mode === 'failure'
    ? { ok: false as const, error: 'Internal failure detail that must not be shown.' }
    : name === 'request'
      ? { ok: true as const, requestId: 'request-1', created: true }
      : { ok: true as const, requestId: 'request-1' }
}

export async function createCoachingRequest() {
  return result('request')
}

export async function cancelCoachingRequest() {
  return result('cancel')
}
