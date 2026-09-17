import { redirectingAdminAction } from './action-request'

export function saveDashboardBanner(form: FormData) {
  return redirectingAdminAction('saveDashboardBanner', form, '/admin/content?error=admin_banner_update_failed')
}
