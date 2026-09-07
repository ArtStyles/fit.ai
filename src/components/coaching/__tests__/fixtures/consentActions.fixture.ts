type ConsentActionFixture = 'grant-training' | 'grant' | 'revoke-body' | 'revoke-training'

function result(action: ConsentActionFixture, formData?: FormData) {
  const fixtureWindow = window as Window & {
    __CONSENT_ACTION_CALLS__?: Array<{ action: string; idempotencyKey: string }>
  }
  fixtureWindow.__CONSENT_ACTION_CALLS__ ??= []
  fixtureWindow.__CONSENT_ACTION_CALLS__.push({
    action,
    idempotencyKey: String(formData?.get('idempotencyKey') ?? ''),
  })
  const mode = new URLSearchParams(window.location.search).get(action)
  const callCount = fixtureWindow.__CONSENT_ACTION_CALLS__.filter(call => call.action === action).length
  return mode === 'failure' || (mode === 'fail-once' && callCount === 1)
    ? { ok: false as const, error: 'No se pudo actualizar el consentimiento.' }
    : { ok: true as const, relationshipId: 'relationship-1', changed: true }
}

export function useRouter() {
  return {
    refresh() {
      const fixtureWindow = window as Window & { __CONSENT_MANAGER_REFRESH_COUNT__?: number }
      fixtureWindow.__CONSENT_MANAGER_REFRESH_COUNT__ = (fixtureWindow.__CONSENT_MANAGER_REFRESH_COUNT__ ?? 0) + 1
    },
  }
}

export async function grantTrainingProfileConsent(formData: FormData) { return result('grant-training', formData) }
export async function grantBodyMeasurementsConsent(formData: FormData) { return result('grant', formData) }
export async function revokeBodyMeasurementsConsent(formData: FormData) { return result('revoke-body', formData) }
export async function revokeTrainingProfileConsent(formData: FormData) { return result('revoke-training', formData) }
