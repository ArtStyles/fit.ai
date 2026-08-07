import 'server-only'

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { createServiceClient } from '@/lib/supabase/service'
import type { Database, Json } from '@/types/database'

export type ProductNotificationType =
  | 'trainer_application_status'
  | 'coaching_request_status'
  | 'coaching_assignment_status'
  | 'coaching_relationship_status'
  | 'coaching_consent_status'

export type CreateProductNotificationInput = {
  recipientUserId: string
  type: ProductNotificationType
  title: string
  body: string
  url: `/${string}`
  dedupeKey: string
  payload?: Json
}

type ProductNotificationRow = Database['public']['Tables']['product_notifications']['Row']

const PRODUCT_NOTIFICATION_TYPES = new Set<ProductNotificationType>([
  'trainer_application_status',
  'coaching_request_status',
  'coaching_assignment_status',
  'coaching_relationship_status',
  'coaching_consent_status',
])

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
])

function getFirebaseCredentials() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as {
        project_id?: string
        client_email?: string
        private_key?: string
      }
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: parsed.project_id,
          clientEmail: parsed.client_email,
          privateKey: parsed.private_key.replace(/\\n/g, '\n'),
        }
      }
    } catch {
      return null
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) return null
  return { projectId, clientEmail, privateKey }
}

function getFirebaseMessaging() {
  const credentials = getFirebaseCredentials()
  if (!credentials) return null

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(credentials),
      projectId: credentials.projectId,
    })
  }

  return getMessaging()
}

function isInternalUrl(value: string): value is `/${string}` {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
}

function assertValidInput(input: CreateProductNotificationInput): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.recipientUserId)) {
    throw new Error('Destinatario no valido.')
  }
  if (!PRODUCT_NOTIFICATION_TYPES.has(input.type)) throw new Error('Tipo de notificacion no valido.')
  if (input.title.trim().length < 1 || input.title.length > 120) throw new Error('Titulo no valido.')
  if (input.body.trim().length < 1 || input.body.length > 500) throw new Error('Contenido no valido.')
  if (!isInternalUrl(input.url)) throw new Error('URL interna no valida.')
  if (!input.dedupeKey.trim()) throw new Error('Clave de deduplicacion no valida.')
}

async function findExistingNotification(
  service: ReturnType<typeof createServiceClient>,
  input: CreateProductNotificationInput,
): Promise<ProductNotificationRow> {
  const { data, error } = await service
    .from('product_notifications')
    .select('*')
    .eq('user_id', input.recipientUserId)
    .eq('dedupe_key', input.dedupeKey.trim())
    .maybeSingle()

  if (error || !data) throw new Error('No se pudo recuperar la notificacion existente.')
  return data
}

async function persistNotification(
  service: ReturnType<typeof createServiceClient>,
  input: CreateProductNotificationInput,
): Promise<{ notification: ProductNotificationRow; inserted: boolean }> {
  const { data, error } = await service
    .from('product_notifications')
    .insert({
      user_id: input.recipientUserId,
      type: input.type,
      title: input.title.trim(),
      body: input.body.trim(),
      url: input.url,
      payload: input.payload ?? {},
      dedupe_key: input.dedupeKey.trim(),
    })
    .select('*')
    .maybeSingle()

  if (error?.code === '23505') {
    return { notification: await findExistingNotification(service, input), inserted: false }
  }
  if (error || !data) throw new Error('No se pudo crear la notificacion.')
  return { notification: data, inserted: true }
}

async function disableInvalidTokens(
  service: ReturnType<typeof createServiceClient>,
  recipientUserId: string,
  tokens: string[],
): Promise<void> {
  if (tokens.length === 0) return

  await service
    .from('product_push_tokens')
    .update({ enabled: false })
    .eq('user_id', recipientUserId)
    .in('token', tokens)
}

async function deliverNativePush(
  service: ReturnType<typeof createServiceClient>,
  notification: ProductNotificationRow,
): Promise<void> {
  const [{ data: preferences, error: preferencesError }, { data: tokenRows, error: tokensError }] = await Promise.all([
    service
      .from('product_notification_preferences')
      .select('push_enabled, professional_enabled')
      .eq('user_id', notification.user_id)
      .maybeSingle(),
    service
      .from('product_push_tokens')
      .select('token')
      .eq('user_id', notification.user_id)
      .eq('enabled', true),
  ])

  if (preferencesError || tokensError) return
  if (preferences && (!preferences.push_enabled || !preferences.professional_enabled)) return

  const tokens = Array.from(new Set((tokenRows ?? []).map(row => row.token).filter(Boolean)))
  if (tokens.length === 0) return

  const messaging = getFirebaseMessaging()
  if (!messaging) return

  for (let index = 0; index < tokens.length; index += 500) {
    const batch = tokens.slice(index, index + 500)
    try {
      const response = await messaging.sendEachForMulticast({
        tokens: batch,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          notificationId: notification.id,
          type: notification.type,
          url: notification.url ?? '',
          payload: JSON.stringify(notification.payload),
        },
        android: {
          priority: 'high',
        },
      })

      const invalidTokens = response.responses.flatMap((result, responseIndex) => {
        if (result.success) return []
        const code = result.error?.code
        const token = batch[responseIndex]
        return code && token && INVALID_TOKEN_CODES.has(code) ? [token] : []
      })

      try {
        await disableInvalidTokens(service, notification.user_id, invalidTokens)
      } catch {
        // Delivery already happened; token cleanup is best-effort as well.
      }
    } catch {
      // The persistent in-app event remains authoritative when Firebase is unavailable.
    }
  }
}

export async function createProductNotification(
  input: CreateProductNotificationInput,
): Promise<ProductNotificationRow> {
  assertValidInput(input)

  const service = createServiceClient()
  const persisted = await persistNotification(service, input)
  if (!persisted.inserted) return persisted.notification

  try {
    await deliverNativePush(service, persisted.notification)
  } catch {
    // Reads, credentials and Firebase are all secondary to the in-app notification.
  }

  return persisted.notification
}
