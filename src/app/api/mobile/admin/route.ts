import {
  handleMobileApi, mobileApiOptions, MobileApiError, readMobileJson, readMobileForm,
} from '@/lib/mobile-api/http'
import {
  requireAdminUserContext, loadAdminUsers, loadAdminDashboardBanner,
} from '@/lib/auth/admin'
import { getAdminOverviewData } from '@/lib/auth/adminOverview'
import {
  loadAdminTrainerApplications, getAdminTrainerApplication,
  countAdminTrainerApplicationsRequiringAttention,
} from '@/lib/auth/adminTrainers'
import { setUserSubscription, suspendUser, reactivateUser } from '@/app/actions/admin'
import { saveDashboardBanner } from '@/app/actions/dashboardBanner'
import {
  startTrainerReview, requestTrainerChanges, approveTrainerApplication,
  rejectTrainerApplication, reinstateTrainerProfile, scheduleTrainerInterview,
  recordTrainerInterviewOutcome,
} from '@/app/actions/adminTrainers'
import { resolveUserTimeZone } from '@/lib/workouts/schedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Only these existing administrative commands can cross the mobile boundary.
// Their actor and service client are resolved again from the verified request.
const actions = {
  setUserSubscription, suspendUser, reactivateUser, saveDashboardBanner,
  startTrainerReview, requestTrainerChanges, approveTrainerApplication,
  rejectTrainerApplication, reinstateTrainerProfile, scheduleTrainerInterview,
  recordTrainerInterviewOutcome,
} as const

function invalidRequest(): never {
  throw new MobileApiError(400, 'invalid_admin_request', 'La operación administrativa no es válida.')
}

export function OPTIONS() { return mobileApiOptions() }

export async function POST(request: Request) {
  return handleMobileApi(request, async ({ user }) => {
    // Authorization precedes parsing, dispatch, account-directory reads and
    // private credential signing. Never accept an actor ID from the payload.
    const admin = await requireAdminUserContext()
    if (admin.user.id !== user.id) throw new MobileApiError(403, 'admin_required')

    const multipart = request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')
    if (multipart) {
      let form: FormData
      try { form = await readMobileForm(request) } catch { return invalidRequest() }
      const operation = form.get('operation')
      if (typeof operation !== 'string' || !Object.hasOwn(actions, operation)) return invalidRequest()
      form.delete('operation')
      return await actions[operation as keyof typeof actions](form) ?? null
    }

    let payload: Record<string, unknown>
    try {
      const parsed: unknown = await readMobileJson(request)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalidRequest()
      payload = parsed as Record<string, unknown>
    } catch { return invalidRequest() }

    switch (payload.operation) {
      case 'shell':
        return {
          adminLabel: admin.user.email ?? 'Administrador',
          pendingTrainerCount: await countAdminTrainerApplicationsRequiringAttention(admin.service).catch(() => undefined),
        }
      case 'users': return loadAdminUsers(admin.service)
      case 'banner': return loadAdminDashboardBanner(admin.service)
      case 'overview':
        return getAdminOverviewData({
          now: new Date().toISOString(),
          timeZone: resolveUserTimeZone(typeof payload.timeZone === 'string' ? payload.timeZone : null),
        })
      case 'trainers':
        return loadAdminTrainerApplications(admin.service, typeof payload.status === 'string' ? payload.status : undefined)
      case 'trainer-detail':
        if (typeof payload.applicationId !== 'string') return invalidRequest()
        // The loader validates the ID and issues short-lived document URLs on
        // the server; credential storage paths and service keys stay here.
        return getAdminTrainerApplication(payload.applicationId)
      default: return invalidRequest()
    }
  })
}
