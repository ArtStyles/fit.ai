export const OWNER_ADMIN_EMAIL = 'fejames07@gmail.com'

export function isOwnerAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === OWNER_ADMIN_EMAIL
}
