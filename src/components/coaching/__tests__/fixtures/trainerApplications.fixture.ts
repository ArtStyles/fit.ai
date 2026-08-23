type RecordedTrainerAction = {
  action: 'save' | 'submit' | 'upload' | 'remove'
  fields: Record<string, string[]>
}

function record(action: RecordedTrainerAction['action'], formData: FormData) {
  const fields: Record<string, string[]> = {}
  formData.forEach((value, key) => {
    fields[key] = [...(fields[key] ?? []), typeof value === 'string' ? value : value.name]
  })
  const fixtureWindow = window as Window & {
    __TRAINER_APPLICATION_ACTION_CALLS__?: RecordedTrainerAction[]
  }
  fixtureWindow.__TRAINER_APPLICATION_ACTION_CALLS__ ??= []
  fixtureWindow.__TRAINER_APPLICATION_ACTION_CALLS__.push({ action, fields })
}

export async function saveTrainerApplicationDraft(formData: FormData) {
  record('save', formData)
  const result = {
    ok: true as const,
    applicationId: '31111111-1111-4111-8111-111111111111',
    status: 'draft' as const,
  }
  if (new URLSearchParams(window.location.search).get('case') === 'save-pending') {
    return new Promise<typeof result>(resolve => {
      const fixtureWindow = window as Window & { __RESOLVE_TRAINER_SAVE__?: () => void }
      fixtureWindow.__RESOLVE_TRAINER_SAVE__ = () => resolve(result)
    })
  }
  return result
}

export async function submitTrainerApplication(formData: FormData) {
  record('submit', formData)
  if (new URLSearchParams(window.location.search).get('case') === 'submit-error') {
    throw new Error('Fixture submission failure')
  }
  return {
    ok: true as const,
    applicationId: '31111111-1111-4111-8111-111111111111',
    status: 'submitted' as const,
  }
}

export async function uploadTrainerCredential(formData: FormData) {
  record('upload', formData)
  const result = {
    ok: true as const,
    credentialId: '41111111-1111-4111-8111-111111111111',
  }
  if (new URLSearchParams(window.location.search).get('case') === 'upload-pending') {
    return new Promise<typeof result>(resolve => {
      const fixtureWindow = window as Window & { __RESOLVE_TRAINER_UPLOAD__?: () => void }
      fixtureWindow.__RESOLVE_TRAINER_UPLOAD__ = () => resolve(result)
    })
  }
  return result
}

export async function removeTrainerCredential(formData: FormData) {
  record('remove', formData)
  const result = { ok: true as const }
  if (new URLSearchParams(window.location.search).get('case') === 'remove-pending') {
    return new Promise<typeof result>(resolve => {
      const fixtureWindow = window as Window & { __RESOLVE_TRAINER_REMOVE__?: () => void }
      fixtureWindow.__RESOLVE_TRAINER_REMOVE__ = () => resolve(result)
    })
  }
  return result
}
