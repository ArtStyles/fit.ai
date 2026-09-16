import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppStore } from './types'
import { clearDeletedAccountBrowserData, type AccountBrowserStorage } from './account-browser-cleanup'

export class AccountDeletionError extends Error {
  constructor(public code: string) { super(code) }
}

/** Auth sign-in may complete before its downloaded SQLite profile is ready. */
export async function deletionNavigationAllowed(store: AppStore, client: SupabaseClient | null, owner: string, version: number, removed: boolean): Promise<boolean> {
  const active = await store.read()
  const session = client ? await client.auth.getSession() : null
  return store.sessionVersion() === version && !session?.error
    && (removed ? active === null && !session?.data.session : active?.accountId === owner && (!session?.data.session || session.data.session.user.id === owner))
}

export function accountDeletionEndpoint(value: string | undefined): string {
  if (!value?.trim()) throw new AccountDeletionError('account_delete_not_configured')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new AccountDeletionError('account_delete_not_configured')
  return new URL('/api/account/delete', url).href
}

export async function deleteConnectedAccount(confirmation: string, options: {
  store: AppStore; client: SupabaseClient | null; endpoint: string; online: () => boolean
  fetcher?: typeof fetch; logout: () => Promise<void>
  browserStorage?: AccountBrowserStorage
}): Promise<{ navigateToLogin: boolean; accountId: string; sessionVersion: number }> {
  if (!['ELIMINAR', 'DELETE'].includes(confirmation.trim())) throw new AccountDeletionError('delete_confirm')
  const { store, client } = options
  if (!options.online()) throw new AccountDeletionError('account_delete_offline')
  const version = store.sessionVersion(), state = await store.read(), owner = state?.accountId
  if (!owner || !state?.remoteUserId || !client) throw new AccountDeletionError('account_delete_login_required')
  const current = await client.auth.getSession(), session = current.data.session
  if (current.error || session?.user.id !== owner || !session.access_token) throw new AccountDeletionError('cuenta_changed')
  const verified = await client.auth.getUser(session.access_token)
  if (verified.error || verified.data.user?.id !== owner) throw new AccountDeletionError('cuenta_changed')
  async function guard() {
    if (store.sessionVersion() !== version || (await store.read())?.accountId !== owner) throw new AccountDeletionError('cuenta_changed')
    const active = await client!.auth.getSession()
    if (active.error || active.data.session?.user.id !== owner) throw new AccountDeletionError('cuenta_changed')
  }
  await guard()
  let response: Response
  try {
    response = await (options.fetcher ?? fetch)(options.endpoint, {
      method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmText: confirmation.trim() }), signal: AbortSignal.timeout(30_000),
    })
  } catch { throw new AccountDeletionError('account_delete_unconfirmed') }
  let result: { ok?: boolean; accountId?: string; code?: string }
  try { result = await response.json() } catch { throw new AccountDeletionError('account_delete_unconfirmed') }
  if (!response.ok || result.ok !== true || result.accountId !== owner) {
    const safe = ['delete_confirm', 'admin_owner_protected', 'auth_required', 'delete_failed']
    throw new AccountDeletionError(safe.includes(result.code ?? '') ? result.code! : 'account_delete_unconfirmed')
  }
  await guard()
  try { await store.removeAccount(owner, version) }
  catch { throw new AccountDeletionError('account_delete_local_pending') }
  let localCleanupFailed = false
  try {
    const storage = options.browserStorage ?? (typeof localStorage === 'undefined' ? null : localStorage)
    if (storage) clearDeletedAccountBrowserData(owner, (state.tables.workouts ?? []).filter(row => row.user_id === owner).map(row => String(row.id)), storage)
  } catch { localCleanupFailed = true }
  // The new SDK session can arrive before prepareSignedInAccount changes the
  // SQLite generation. Check both identities after the asynchronous deletion.
  const latestAuth = await client.auth.getSession()
  if (store.sessionVersion() === version + 1 && !latestAuth.error && latestAuth.data.session?.user.id === owner) {
    try { await options.logout() } catch { localCleanupFailed = true }
  }
  if (localCleanupFailed) throw new AccountDeletionError('account_delete_local_pending')
  return { accountId: owner, sessionVersion: version + 1, navigateToLogin: await deletionNavigationAllowed(store, client, owner, version + 1, true) }
}
