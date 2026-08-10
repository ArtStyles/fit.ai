function result(action: 'grant' | 'revoke-body' | 'revoke-training') {
  const mode = new URLSearchParams(window.location.search).get(action)
  return mode === 'failure'
    ? { ok: false as const, error: 'No se pudo actualizar el consentimiento.' }
    : { ok: true as const, relationshipId: 'relationship-1', changed: true }
}

export async function grantBodyMeasurementsConsent() { return result('grant') }
export async function revokeBodyMeasurementsConsent() { return result('revoke-body') }
export async function revokeTrainingProfileConsent() { return result('revoke-training') }
