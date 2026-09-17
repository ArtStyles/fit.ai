import { redirectingAdminAction } from './action-request'

const failure = '/admin/users?error=admin_update_failed'
export function setUserSubscription(form: FormData) {
  return redirectingAdminAction('setUserSubscription', form, failure)
}
export function suspendUser(form: FormData) {
  return redirectingAdminAction('suspendUser', form, failure)
}
export function reactivateUser(form: FormData) {
  return redirectingAdminAction('reactivateUser', form, failure)
}
