function result(name: 'request' | 'cancel') {
  const mode = new URLSearchParams(window.location.search).get(name)
  return mode === 'failure'
    ? { ok: false as const, error: 'Este servicio ya no está disponible.' }
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

export async function acceptCoachingRequest() {
  const mode = new URLSearchParams(window.location.search).get('accept')
  const sameClient = new URLSearchParams(window.location.search).has('sameClient')
  return mode === 'conflict'
    ? { ok: false as const, error: 'La solicitud se actualizó. Recarga la bandeja.', refreshed: true }
    : { ok: true as const, relationshipId: 'relationship-1', acceptedRequestId: 'request-1', cancelledRequestIds: sameClient ? ['request-2'] : [] }
}

export async function declineCoachingRequest() {
  return new URLSearchParams(window.location.search).get('decline') === 'conflict'
    ? { ok: false as const, error: 'La solicitud se actualizó. Recarga la bandeja.', refreshed: true }
    : { ok: true as const, requestId: 'request-1' }
}
