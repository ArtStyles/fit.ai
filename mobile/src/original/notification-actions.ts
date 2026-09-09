import { selectDashboardNotice } from '@/components/dashboard/dashboardViewModel'
import { DASHBOARD_BANNER_SLOT, isDashboardBannerVisible, type DashboardBannerData } from '@/lib/dashboard/banner'
import { isCheckInDue } from '@/lib/profile/checkin'
import { buildCheckInNoticeKey, buildPlanUpdateNoticeKey, buildPromoNoticeKey } from '@/lib/notifications/attention'
import { addDays, getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'
import type { NotificationAttention, NotificationAttentionResult, ProductNotificationPage, ProductNotificationView } from '@/app/actions/notifications'
import { getAppStore, type AppRow, type AppState } from './storage'
import { remote } from './bridge-client'

export type { NotificationAttention, NotificationAttentionResult, ProductNotificationPage, ProductNotificationView }
type Result = { ok: true } | { ok: false; error: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PAGE_SIZE = 30
const failure = (error: unknown): Result => ({ ok: false, error: error instanceof Error ? error.message : 'No se pudo guardar el cambio.' })

function ownRows(state: AppState, table: string) { return (state.tables[table] ?? []).filter(row => row.user_id === state.accountId) }
function requireSame(state: AppState, accountId: string) { if (state.accountId !== accountId) throw new Error('La cuenta cambió. Vuelve a abrir esta pantalla.') }
async function active() {
  const store = await getAppStore(); const state = await store.read()
  if (!state) throw new Error('Sesión local no válida.')
  return { store, state }
}
async function verifiedRemote(accountId: string) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('Conecta a internet para guardar este cambio en tu cuenta.')
  if (!remote) throw new Error('La conexión con la cuenta no está configurada.')
  const { data, error } = await remote.auth.getUser()
  const state = await (await getAppStore()).read()
  if (error || !data.user || data.user.id !== accountId || state?.accountId !== accountId || state.remoteUserId !== accountId) {
    throw new Error('Vuelve a conectar esta cuenta para gestionar sus notificaciones.')
  }
  return remote
}

export function notificationAttentionForState(state: AppState, now = new Date()): NotificationAttention | null {
  const profile = state.tables.profiles?.find(row => row.id === state.accountId)
  const plan = ownRows(state, 'workout_plans').find(row => row.is_active)
  const timeZone = resolveUserTimeZone(profile?.timezone)
  const banner = (state.tables.dashboard_banners ?? []).find(row => row.slot === DASHBOARD_BANNER_SLOT) as DashboardBannerData | undefined
  const visiblePromo = isDashboardBannerVisible(banner ?? null, getLocalDateString(now, timeZone)) ? banner! : null
  const dismissed = new Set(ownRows(state, 'notification_attention_dismissals').map(row => row.notice_key))
  const candidateAi = plan?.ai_notes && Date.parse(plan.updated_at) > addDays(now, -7, timeZone).getTime() ? plan.ai_notes as string : null
  const planKey = candidateAi ? buildPlanUpdateNoticeKey(plan!.id, plan!.updated_at) : null
  const checkKey = isCheckInDue(profile?.last_check_in_at ?? null, now) ? buildCheckInNoticeKey(profile?.last_check_in_at ?? null) : null
  const promoKey = visiblePromo ? buildPromoNoticeKey(visiblePromo.slot, visiblePromo.updated_at) : null
  const aiNotes = planKey && dismissed.has(planKey) ? null : candidateAi
  const promo = promoKey && dismissed.has(promoKey) ? null : visiblePromo
  const notice = selectDashboardNotice({ needsPlan: !plan, checkInDue: !!checkKey && !dismissed.has(checkKey), aiNotes, promo })
  return notice ? { notice, aiNotes: notice.kind === 'ai-notes' ? aiNotes : null, planName: plan?.name ?? null,
    dismissalKey: notice.kind === 'check-in' ? checkKey : notice.kind === 'ai-notes' ? planKey : notice.kind === 'promo' ? promoKey : null,
    promo: visiblePromo } : null
}

export async function loadNotificationAttention(): Promise<NotificationAttentionResult> {
  try { return { status: 'ready', attention: notificationAttentionForState((await active()).state) } }
  catch { return { status: 'error' } }
}

export async function dismissNotificationAttention(noticeKey: string): Promise<Result> {
  try {
    if (typeof noticeKey !== 'string' || noticeKey.length > 160) throw new Error('Aviso no válido.')
    const { store, state } = await active()
    await store.mutate(draft => {
      requireSame(draft, state.accountId)
      const rows = ownRows(draft, 'notification_attention_dismissals')
      if (rows.some(row => row.notice_key === noticeKey)) return
      if (notificationAttentionForState(draft)?.dismissalKey !== noticeKey) throw new Error('El aviso ya no corresponde a tu estado actual.')
      draft.tables.notification_attention_dismissals ??= []
      draft.tables.notification_attention_dismissals.push({ id: crypto.randomUUID(), user_id: draft.accountId, notice_key: noticeKey, dismissed_at: new Date().toISOString() })
    })
    return { ok: true }
  } catch (error) { return failure(error) }
}

export async function dismissPlanUpdateNotification(noticeKey: string): Promise<Result> {
  if (typeof noticeKey !== 'string' || !noticeKey.startsWith('plan-update:')) return { ok: false, error: 'Aviso no válido.' }
  return dismissNotificationAttention(noticeKey)
}

type Cursor = { createdAt: string; id: string }
function decodeCursor(value?: string | null): Cursor | null {
  if (!value) return null
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Cursor no válido.')
  try {
    const row = JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/'))) as Cursor
    if (!UUID.test(row.id) || typeof row.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.createdAt) || !Number.isFinite(Date.parse(row.createdAt))) throw new Error()
    return row
  } catch { throw new Error('Cursor no válido.') }
}
function encodeCursor(row: AppRow) { return btoa(JSON.stringify({ createdAt: row.created_at, id: row.id })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function view(row: AppRow): ProductNotificationView {
  return { id: row.id, type: row.type, title: row.title, body: row.body, url: row.url ?? null, readAt: row.read_at ?? null, createdAt: row.created_at }
}

export async function listProductNotifications(input: { cursor?: string | null } = {}): Promise<ProductNotificationPage> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Solicitud no válida.')
    const cursor = decodeCursor(input.cursor)
    const { store, state } = await active()
    let rows = ownRows(state, 'product_notifications').filter(row => row.dismissed_at == null)
    let unreadCount = rows.filter(row => row.read_at == null).length
    if (state.remoteUserId && (typeof navigator === 'undefined' || navigator.onLine)) {
      const client = await verifiedRemote(state.accountId)
      let query = client.from('product_notifications').select('*').eq('user_id', state.accountId).is('dismissed_at', null).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1)
      if (cursor) query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
      const [response, unread] = await Promise.all([query, client.from('product_notifications').select('id', { count: 'exact', head: true }).eq('user_id', state.accountId).is('dismissed_at', null).is('read_at', null)])
      if (response.error) throw new Error('No se pudieron cargar las notificaciones de tu cuenta.')
      rows = (response.data ?? []).filter(row => row.user_id === state.accountId)
      unreadCount = unread.error ? unreadCount : unread.count ?? 0
      const existing = new Map(ownRows(state, 'product_notifications').map(row => [row.id, row]))
      if (rows.some(row => JSON.stringify(existing.get(row.id)) !== JSON.stringify(row))) {
        await store.mutate(draft => {
          requireSame(draft, state.accountId)
          const merged = new Map(ownRows(draft, 'product_notifications').map(row => [row.id, row]))
          for (const row of rows) merged.set(row.id, row)
          draft.tables.product_notifications = [...merged.values()]
        })
      }
    }
    rows = rows.filter(row => !cursor || row.created_at < cursor.createdAt || (row.created_at === cursor.createdAt && row.id < cursor.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    const visible = rows.slice(0, PAGE_SIZE)
    return { notifications: visible.map(view), nextCursor: rows.length > PAGE_SIZE ? encodeCursor(visible.at(-1)!) : null, unreadCount }
  } catch (error) { return { notifications: [], nextCursor: null, unreadCount: null, error: error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones.' } }
}

async function changeNotification(id: string, field: 'read_at' | 'dismissed_at'): Promise<Result> {
  try {
    if (typeof id !== 'string' || !UUID.test(id.trim())) throw new Error('Notificación no válida.')
    const { store, state } = await active(); const normalized = id.trim(); const at = new Date().toISOString()
    if (state.remoteUserId) {
      const client = await verifiedRemote(state.accountId)
      const { data, error } = await client.from('product_notifications').update({ [field]: at }).eq('id', normalized).eq('user_id', state.accountId).select('id').maybeSingle()
      if (error || !data) throw new Error('No se pudo actualizar la notificación de tu cuenta.')
    } else if (!ownRows(state, 'product_notifications').some(row => row.id === normalized)) throw new Error('Notificación no encontrada.')
    await store.mutate(draft => {
      requireSame(draft, state.accountId)
      const row = ownRows(draft, 'product_notifications').find(item => item.id === normalized)
      if (row && row[field] == null) row[field] = at
    })
    return { ok: true }
  } catch (error) { return failure(error) }
}
export async function markProductNotificationRead(id: string): Promise<Result> { return changeNotification(id, 'read_at') }
export async function dismissProductNotification(id: string): Promise<Result> { return changeNotification(id, 'dismissed_at') }

export async function updateProductNotificationPreferences(input: { professionalEnabled: boolean; pushEnabled: boolean }): Promise<Result> {
  try {
    if (!input || typeof input.professionalEnabled !== 'boolean' || typeof input.pushEnabled !== 'boolean') throw new Error('Preferencias no válidas.')
    const { store, state } = await active()
    const preference = { user_id: state.accountId, professional_enabled: input.professionalEnabled, push_enabled: input.pushEnabled }
    if (state.remoteUserId) {
      const client = await verifiedRemote(state.accountId)
      const { error } = await client.from('product_notification_preferences').upsert(preference, { onConflict: 'user_id' })
      if (error) throw new Error('No se pudieron guardar las preferencias de tu cuenta.')
    }
    await store.mutate(draft => { requireSame(draft, state.accountId); draft.tables.product_notification_preferences = [preference] })
    return { ok: true }
  } catch (error) { return failure(error) }
}

export async function registerProductPushToken(input: { token: string; platform: string; deviceId: string }): Promise<Result> {
  try {
    if (!input || typeof input.token !== 'string' || !input.token.trim()) throw new Error('Token de push vacío.')
    if (!['android', 'ios'].includes(input.platform)) throw new Error('Plataforma de push no soportada.')
    if (typeof input.deviceId !== 'string' || !input.deviceId.trim()) throw new Error('Dispositivo no válido.')
    const { state } = await active(); const client = await verifiedRemote(state.accountId)
    const { error } = await client.from('product_push_tokens').upsert({ user_id: state.accountId, token: input.token.trim(), platform: input.platform, device_id: input.deviceId.trim(), enabled: true, last_seen_at: new Date().toISOString() }, { onConflict: 'user_id,device_id' })
    if (error) throw new Error('No se pudo registrar el dispositivo.')
    return { ok: true }
  } catch (error) { return failure(error) }
}
export async function disableProductPushToken(token: string): Promise<Result> {
  try {
    if (typeof token !== 'string' || !token.trim()) throw new Error('Token de push vacío.')
    const { state } = await active(); const client = await verifiedRemote(state.accountId)
    const { data, error } = await client.from('product_push_tokens').update({ enabled: false }).eq('token', token.trim()).eq('user_id', state.accountId).select('id').maybeSingle()
    if (error || !data) throw new Error('No se pudo desactivar el dispositivo.')
    return { ok: true }
  } catch (error) { return failure(error) }
}
