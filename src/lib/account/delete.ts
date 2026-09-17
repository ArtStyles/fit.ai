import 'server-only'
import { isOwnerAdminEmail } from '@/lib/auth/identity'

type Result = { ok: true; accountId: string } | { ok: false; code: 'delete_confirm' | 'auth_required' | 'admin_owner_protected' | 'delete_failed' }
type Outcome = { error: unknown }
type Bucket = {
  list(prefix: string, options: { limit: number; offset: number; sortBy: { column: string; order: string } }): Promise<{ data: { id: string | null; name: string }[] | null; error: unknown }>
  remove(paths: string[]): Promise<Outcome>
}
type Admin = {
  storage: { from(bucket: string): Bucket }
  rpc(name: 'prepare_verified_account_deletion', args: { p_user_id: string }): PromiseLike<Outcome>
  auth: { admin: { deleteUser(id: string): Promise<Outcome> } }
}

async function removeOwnedUploads(bucket: Bucket, owner: string) {
  const paths: string[] = []
  async function collect(prefix: string, depth: number) {
    if (depth > 8 || paths.length > 100_000) throw new Error('Upload cleanup limit exceeded')
    for (let offset = 0; ; offset += 100) {
      const result = await bucket.list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
      if (result.error || !result.data) throw new Error('Upload listing failed')
      for (const object of result.data) {
        if (!object.name || object.name === '.' || object.name === '..' || /[\\/]/.test(object.name)) throw new Error('Invalid upload path')
        const path = `${prefix}/${object.name}`
        if (object.id) paths.push(path)
        else await collect(path, depth + 1)
      }
      if (result.data.length < 100) break
    }
  }
  await collect(owner, 0)
  // Collect before deleting: offsets must never skip files as the list shrinks.
  for (let index = 0; index < paths.length; index += 100) {
    if ((await bucket.remove(paths.slice(index, index + 100))).error) throw new Error('Upload cleanup failed')
  }
}

/** Shared by the cookie-authenticated web action and bearer-authenticated API.
 * Identity must come from auth.getUser, never a request body or cached session.
 * Cleanup is retryable but not atomic across Storage and Auth; failure is never
 * reported as successful account deletion. Counterpart identities and history
 * are retained; their professional copies are archived when a trainer leaves.
 */
export async function deleteVerifiedAccount(confirmation: string, options: {
  verifyUser: () => Promise<{ id: string; email?: string } | null>
  createAdmin: () => Admin
}): Promise<Result> {
  if (!['ELIMINAR', 'DELETE'].includes(confirmation.trim())) return { ok: false, code: 'delete_confirm' }
  try {
    const user = await options.verifyUser()
    if (!user || !/^[0-9a-f-]{36}$/i.test(user.id)) return { ok: false, code: 'auth_required' }
    if (isOwnerAdminEmail(user.email)) return { ok: false, code: 'admin_owner_protected' }
    const admin = options.createAdmin()
    for (const name of ['avatars', 'posts', 'trainer-credentials', 'fitness-card-photos']) await removeOwnedUploads(admin.storage.from(name), user.id)
    // Deletion is not a plain Auth cascade: professional RESTRICT dependencies
    // need transactional cleanup and counterpart prescriptions must stay locked.
    if ((await admin.rpc('prepare_verified_account_deletion', { p_user_id: user.id })).error) return { ok: false, code: 'delete_failed' }
    // Professional security audit remains immutable, including its UUIDs. The
    // RPC removes the profile before this external Auth step; retries are safe.
    if ((await admin.auth.admin.deleteUser(user.id)).error) return { ok: false, code: 'delete_failed' }
    return { ok: true, accountId: user.id }
  } catch { return { ok: false, code: 'delete_failed' } }
}
