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
  return mode === 'conflict'
    ? { ok: false as const, error: 'La solicitud se actualizó. Recarga la bandeja.', refreshed: true }
    : { ok: true as const, relationshipId: 'relationship-1', acceptedRequestId: 'request-1', cancelledRequestIds: [] }
}

export async function declineCoachingRequest() {
  return { ok: true as const, requestId: 'request-1' }
}
