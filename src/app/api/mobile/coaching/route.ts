import { handleMobileApi, MobileApiError, mobileApiOptions, readMobileForm } from '@/lib/mobile-api/http'
import { requireAppUserContext } from '@/lib/auth/server'
import { saveTrainerApplicationDraft, submitTrainerApplication, withdrawTrainerApplication, uploadTrainerCredential, removeTrainerCredential, prepareTrainerCredentialUpload, finishTrainerCredentialUpload } from '@/app/actions/trainerApplications'
import { updateTrainerProfile } from '@/app/actions/trainerProfile'

export const runtime = 'nodejs'
export async function OPTIONS() { return mobileApiOptions() }
export async function POST(request: Request) {
  return handleMobileApi(request, async () => {
    await requireAppUserContext()
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) throw new MobileApiError(400, 'invalid_form')
    const data = await readMobileForm(request)
    const operation = data.get('operation')
    data.delete('operation')
    switch (operation) {
      case 'saveDraft': return saveTrainerApplicationDraft(data)
      case 'submit': return submitTrainerApplication(data)
      case 'withdraw': return withdrawTrainerApplication(data)
      case 'removeCredential': return removeTrainerCredential(data)
      case 'prepareCredential':
      case 'finishCredential':
        if (data.get('file') instanceof File) throw new MobileApiError(400, 'direct_upload_required')
        return operation === 'prepareCredential' ? prepareTrainerCredentialUpload(data) : finishTrainerCredentialUpload(data)
      case 'uploadCredential':
        // Documents use signed direct uploads so the API does not reduce the 10 MiB limit.
        if (data.get('credentialType') !== 'link' || data.get('file') instanceof File) throw new MobileApiError(400, 'direct_upload_required')
        return uploadTrainerCredential(data)
      case 'updateProfile': return updateTrainerProfile(data)
      default: throw new MobileApiError(400, 'invalid_operation')
    }
  })
}
