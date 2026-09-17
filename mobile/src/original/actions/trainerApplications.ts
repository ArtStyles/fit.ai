import { mobileApi } from '../mobile-api'
import { createConnectedClient } from '../bridge-client'
import { getAppStore } from '../storage'
import { validateTrainerCredential } from '@/lib/coaching/applicationValidation'
import { trainerCredentialPath } from '@/lib/coaching/trainerCredentialPath'
import type * as Server from '@/app/actions/trainerApplications'

export function coachingForm(operation: string, source: FormData) {
  const data = new FormData()
  for (const [key, value] of source) data.append(key, value)
  data.set('operation', operation)
  return data
}
const call = <T>(operation: string, data: FormData) => mobileApi<T>('/api/mobile/coaching', coachingForm(operation, data))
export const saveTrainerApplicationDraft: typeof Server.saveTrainerApplicationDraft = data => call('saveDraft', data)
export const submitTrainerApplication: typeof Server.submitTrainerApplication = data => call('submit', data)
export const withdrawTrainerApplication: typeof Server.withdrawTrainerApplication = data => call('withdraw', data)
export const removeTrainerCredential: typeof Server.removeTrainerCredential = data => call('removeCredential', data)

export const uploadTrainerCredential: typeof Server.uploadTrainerCredential = async source => {
  const file = source.get('file')
  if (source.get('credentialType') !== 'document') {
    const data = coachingForm('uploadCredential', source); data.delete('file')
    return mobileApi('/api/mobile/coaching', data)
  }
  const validation = validateTrainerCredential({ credentialType: 'document', title: String(source.get('title') ?? ''), file: file instanceof File ? file : null })
  if (!validation.ok) return { ok: false, error: 'Revisa la credencial.', fieldErrors: validation.fieldErrors }
  const document = file as File
  const store = await getAppStore(), version = store.sessionVersion(), owner = (await store.read())?.accountId
  const guard = async () => {
    const state = await store.read()
    if (!owner || version !== store.sessionVersion() || state?.accountId !== owner || state.remoteUserId !== owner) throw new Error('La cuenta activa cambió. Comprueba la solicitud desde la cuenta original.')
  }
  await guard()
  const metadata = coachingForm('prepareCredential', source)
  metadata.delete('file'); metadata.delete('credentialId')
  metadata.set('mimeType', document.type); metadata.set('sizeBytes', String(document.size))
  const prepared = await mobileApi<Awaited<ReturnType<typeof Server.prepareTrainerCredentialUpload>>>('/api/mobile/coaching', metadata)
  await guard()
  if (!prepared.ok) return prepared
  const extensions: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
  const expectedPath = trainerCredentialPath(owner!, String(source.get('applicationId')), prepared.credentialId, extensions[document.type])
  if (prepared.path !== expectedPath || !prepared.token) throw new Error('La autorización de carga no corresponde a esta cuenta.')
  const client = await createConnectedClient(owner)
  const { error } = await client.storage.from('trainer-credentials').uploadToSignedUrl(prepared.path, prepared.token, document, { contentType: document.type, upsert: false })
  await guard()
  if (error) return { ok: false, error: 'No se pudo subir el documento privado. Intenta nuevamente.' }
  metadata.set('operation', 'finishCredential'); metadata.set('credentialId', prepared.credentialId)
  const result = await mobileApi<Awaited<ReturnType<typeof Server.finishTrainerCredentialUpload>>>('/api/mobile/coaching', metadata)
  await guard()
  return result
}
