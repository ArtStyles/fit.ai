import { mobileApi } from '../mobile-api'
import { navigate, RouteRedirect } from '../router'

export function adminAction<T>(operation: string, form: FormData): Promise<T> {
  const payload = new FormData()
  form.forEach((value, key) => payload.append(key, value))
  payload.set('operation', operation)
  return mobileApi<T>('/api/mobile/admin', payload)
}

export async function redirectingAdminAction(operation: string, form: FormData, fallback: string): Promise<void> {
  try { await adminAction(operation, form) }
  catch (error) {
    if (error instanceof RouteRedirect) { navigate(error.href); return }
    navigate(fallback)
  }
}
