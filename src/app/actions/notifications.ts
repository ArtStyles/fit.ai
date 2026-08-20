'use server'

import { createClient } from '@/lib/supabase/server'
import { selectDashboardNotice, type DashboardNotice } from '@/components/dashboard/dashboardViewModel'
import {
  DASHBOARD_BANNER_SLOT,
  isDashboardBannerVisible,
  type DashboardBannerData,
} from '@/lib/dashboard/banner'
import { isCheckInDue } from '@/lib/profile/checkin'
import { addDays, getLocalDateString, resolveUserTimeZone } from '@/lib/workouts/schedule'
import type { Database } from '@/types/database'

type PushPlatform = 'android' | 'ios'

type PushTokenResult =
  | { ok: true }
  | { ok: false; error: string }

type ProductNotificationRow = Database['public']['Tables']['product_notifications']['Row']

export type ProductNotificationView = {
  id: string
  type: string
  title: string
  body: string
  url: string | null
  readAt: string | null
  createdAt: string
}

export type ProductNotificationPage = {
  notifications: ProductNotificationView[]
  nextCursor: string | null
  unreadCount: number | null
  error?: string
}

export type NotificationAttention = {
  notice: DashboardNotice
  aiNotes: string | null
  planName: string | null
  promo: DashboardBannerData | null
}

export type NotificationAttentionResult =
  | { status: 'ready'; attention: NotificationAttention | null }
  | { status: 'error' }

type AttentionProfileRow = {
  last_check_in_at: string | null
  timezone: string | null
}

type AttentionPlanRow = {
  id: string
  name: string
  ai_notes: string | null
  created_at: string
}

const PRODUCT_NOTIFICATION_PAGE_SIZE = 30
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

type NotificationCursor = {
  createdAt: string
  id: string
}

function emptyNotificationPage(error?: string): ProductNotificationPage {
  return {
    notifications: [],
    nextCursor: null,
    unreadCount: null,
    ...(error ? { error } : {}),
  }
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && ISO_TIMESTAMP_PATTERN.test(value)
    && Number.isFinite(Date.parse(value))
}

function decodeNotificationCursor(value: unknown): NotificationCursor | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return undefined
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    const cursor = parsed as Record<string, unknown>
    if (!isValidTimestamp(cursor.createdAt)) return undefined
    if (typeof cursor.id !== 'string' || !UUID_PATTERN.test(cursor.id)) return undefined
    return { createdAt: cursor.createdAt, id: cursor.id }
  } catch {
    return undefined
  }
}

function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url')
}

function toNotificationView(row: ProductNotificationRow): ProductNotificationView {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url,
    readAt: row.read_at,
    createdAt: row.created_at,
  }
}

async function loadNotificationAttentionData(): Promise<NotificationAttention | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Notification attention requires an authenticated user.')

  const [profileResult, planResult, bannerResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('last_check_in_at, timezone')
      .eq('id', user.id)
      .maybeSingle() as unknown as Promise<{ data: AttentionProfileRow | null; error: { message?: string } | null }>,
    supabase
      .from('workout_plans')
      .select('id, name, ai_notes, created_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle() as unknown as Promise<{ data: AttentionPlanRow | null; error: { message?: string } | null }>,
    supabase
      .from('dashboard_banners')
      .select('slot, kind, title, description, image_url, cta_label, cta_href, status, starts_on, ends_on, updated_at')
      .eq('slot', DASHBOARD_BANNER_SLOT)
      .maybeSingle() as unknown as Promise<{ data: DashboardBannerData | null; error: { message?: string } | null }>,
  ])

  if (profileResult.error || planResult.error) {
    throw new Error('Notification attention data is unavailable.')
  }

  const now = new Date()
  const profile = profileResult.data
  const plan = planResult.data
  const timeZone = resolveUserTimeZone(profile?.timezone)
  const visiblePromo = bannerResult.error
    ? null
    : isDashboardBannerVisible(bannerResult.data, getLocalDateString(now, timeZone))
      ? bannerResult.data
      : null
  const aiNotes = plan?.ai_notes
    && new Date(plan.created_at).getTime() > addDays(now, -7, timeZone).getTime()
    ? plan.ai_notes
    : null
  const notice = selectDashboardNotice({
    needsPlan: !plan,
    checkInDue: isCheckInDue(profile?.last_check_in_at ?? null, now),
    aiNotes,
    promo: visiblePromo ? { title: visiblePromo.title } : null,
  })

  if (!notice) return null
  return {
    notice,
    aiNotes,
    planName: plan?.name ?? null,
    promo: visiblePromo,
  }
}

export async function loadNotificationAttention(): Promise<NotificationAttentionResult> {
  try {
    return { status: 'ready', attention: await loadNotificationAttentionData() }
  } catch {
    return { status: 'error' }
  }
}

async function listProductNotificationsData(
  input: { cursor?: string | null } = {},
): Promise<ProductNotificationPage> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return emptyNotificationPage('Solicitud no válida.')
  }

  const cursor = decodeNotificationCursor(input.cursor)
  if (cursor === undefined) return emptyNotificationPage('Cursor no válido.')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return emptyNotificationPage('Sesión no válida.')

  let query = (supabase
    .from('product_notifications') as any)
    .select('id, type, title, body, url, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PRODUCT_NOTIFICATION_PAGE_SIZE + 1)

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }

  const unreadCountQuery = (supabase
    .from('product_notifications') as any)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null)

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    query as Promise<{
      data: ProductNotificationRow[] | null
      error: { message?: string } | null
    }>,
    unreadCountQuery as Promise<{
      count: number | null
      error: { message?: string } | null
    }>,
  ])
  if (error) return emptyNotificationPage('No se pudieron cargar las notificaciones.')

  const rows = data ?? []
  const hasMore = rows.length > PRODUCT_NOTIFICATION_PAGE_SIZE
  const visible = hasMore ? rows.slice(0, PRODUCT_NOTIFICATION_PAGE_SIZE) : rows
  const last = visible.at(-1)

  return {
    notifications: visible.map(toNotificationView),
    nextCursor: hasMore && last
      ? encodeNotificationCursor({ createdAt: last.created_at, id: last.id })
      : null,
    unreadCount: countError ? null : count ?? 0,
  }
}

export async function listProductNotifications(
  input: { cursor?: string | null } = {},
): Promise<ProductNotificationPage> {
  try {
    return await listProductNotificationsData(input)
  } catch {
    return emptyNotificationPage('No se pudieron cargar las notificaciones.')
  }
}

export async function markProductNotificationRead(id: string): Promise<PushTokenResult> {
  const normalized = typeof id === 'string' ? id.trim() : ''
  if (!UUID_PATTERN.test(normalized)) {
    return { ok: false, error: 'Notificación no válida.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión no válida.' }

  const { error } = await (supabase
    .from('product_notifications') as any)
    .update({ read_at: new Date().toISOString() })
    .eq('id', normalized)
    .eq('user_id', user.id)
    .is('read_at', null)

  if (error) return { ok: false, error: 'No se pudo marcar la notificación.' }
  return { ok: true }
}

export async function registerProductPushToken(input: {
  token: string
  platform: string
  deviceId: string
}): Promise<PushTokenResult> {
  const token = input.token.trim()
  const deviceId = input.deviceId.trim()
  if (!token) return { ok: false, error: 'Token de push vacio.' }
  if (!isPushPlatform(input.platform)) return { ok: false, error: 'Plataforma de push no soportada.' }
  if (!deviceId) return { ok: false, error: 'Dispositivo no valido.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesion no valida.' }

  const { error } = await (supabase
    .from('product_push_tokens') as any)
    .upsert({
      user_id: user.id,
      token,
      platform: input.platform,
      device_id: deviceId,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,device_id' })

  if (error) return { ok: false, error: 'No se pudo registrar el dispositivo.' }
  return { ok: true }
}

function isPushPlatform(value: string): value is PushPlatform {
  return value === 'android' || value === 'ios'
}

export async function disableProductPushToken(token: string): Promise<PushTokenResult> {
  const normalized = token.trim()
  if (!normalized) return { ok: true }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesion no valida.' }

  const { error } = await (supabase
    .from('product_push_tokens') as any)
    .update({ enabled: false })
    .eq('token', normalized)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: 'No se pudo desactivar el dispositivo.' }
  return { ok: true }
}

export async function updateProductNotificationPreferences(input: {
  professionalEnabled: boolean
  pushEnabled: boolean
}): Promise<PushTokenResult> {
  if (typeof input.professionalEnabled !== 'boolean' || typeof input.pushEnabled !== 'boolean') {
    return { ok: false, error: 'Preferencias no validas.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesion no valida.' }

  const { error } = await (supabase
    .from('product_notification_preferences') as any)
    .upsert({
      professional_enabled: input.professionalEnabled,
      push_enabled: input.pushEnabled,
    }, { onConflict: 'user_id' })

  if (error) return { ok: false, error: 'No se pudieron guardar las preferencias.' }
  return { ok: true }
}
