import 'server-only'

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { createServiceClient } from '@/lib/supabase/service'

type SocialNotificationType = 'like' | 'comment' | 'follow' | 'follow_request'

type ActorProfile = {
  username: string | null
  full_name: string | null
}

type PushPreferenceRow = {
  likes_enabled: boolean
  comments_enabled: boolean
  follows_enabled: boolean
  follow_requests_enabled: boolean
}

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

function preferenceEnabled(type: SocialNotificationType, prefs: PushPreferenceRow | null): boolean {
  if (!prefs) return true
  if (type === 'like') return prefs.likes_enabled
  if (type === 'comment') return prefs.comments_enabled
  if (type === 'follow') return prefs.follows_enabled
  return prefs.follow_requests_enabled
}

function actorName(actor: ActorProfile | null): string {
  return actor?.full_name?.trim() || actor?.username?.trim() || 'Alguien'
}

function notificationCopy(type: SocialNotificationType, actor: string): { title: string; body: string } {
  if (type === 'like') return { title: 'Nuevo like', body: `${actor} le dio like a tu publicacion.` }
  if (type === 'comment') return { title: 'Nuevo comentario', body: `${actor} comento tu publicacion.` }
  if (type === 'follow') return { title: 'Nuevo seguidor', body: `${actor} empezo a seguirte.` }
  return { title: 'Nueva solicitud', body: `${actor} quiere seguirte.` }
}

function notificationUrl(type: SocialNotificationType, postId?: string): string {
  if ((type === 'like' || type === 'comment') && postId) return `/post/${postId}`
  if (type === 'follow_request') return '/solicitudes'
  return '/feed'
}

async function sendSocialNotification(params: {
  recipientUserId: string
  actorUserId: string
  type: SocialNotificationType
  postId?: string
}): Promise<void> {
  if (params.recipientUserId === params.actorUserId) return

  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return
  }

  const messaging = getFirebaseMessaging()
  if (!messaging) return

  const [{ data: prefs }, { data: tokens }, { data: actor }] = await Promise.all([
    (service.from('social_notification_preferences') as any)
      .select('likes_enabled, comments_enabled, follows_enabled, follow_requests_enabled')
      .eq('user_id', params.recipientUserId)
      .maybeSingle() as Promise<{ data: PushPreferenceRow | null }>,
    (service.from('social_push_tokens') as any)
      .select('token')
      .eq('user_id', params.recipientUserId)
      .eq('enabled', true) as Promise<{ data: { token: string }[] | null }>,
    (service.from('profiles') as any)
      .select('username, full_name')
      .eq('id', params.actorUserId)
      .maybeSingle() as Promise<{ data: ActorProfile | null }>,
  ])

  if (!preferenceEnabled(params.type, prefs)) return

  const recipientTokens = Array.from(new Set((tokens ?? []).map(row => row.token).filter(Boolean)))
  if (recipientTokens.length === 0) return

  const copy = notificationCopy(params.type, actorName(actor))
  const url = notificationUrl(params.type, params.postId)

  for (let i = 0; i < recipientTokens.length; i += 500) {
    const batch = recipientTokens.slice(i, i + 500)
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: copy,
      data: {
        type: params.type,
        url,
        postId: params.postId ?? '',
      },
      android: {
        priority: 'high',
      },
    })

    const invalidTokens = response.responses.flatMap((result, index) => {
      if (result.success) return []
      const code = result.error?.code
      return code && INVALID_TOKEN_CODES.has(code) ? [batch[index]] : []
    })

    if (invalidTokens.length > 0) {
      await (service.from('social_push_tokens') as any)
        .update({ enabled: false })
        .in('token', invalidTokens)
    }
  }
}

async function getPostOwner(postId: string): Promise<string | null> {
  let service: ReturnType<typeof createServiceClient>
  try {
    service = createServiceClient()
  } catch {
    return null
  }

  const { data } = await (service.from('posts') as any)
    .select('user_id')
    .eq('id', postId)
    .maybeSingle() as { data: { user_id: string } | null }

  return data?.user_id ?? null
}

export async function notifyPostLiked(postId: string, actorUserId: string): Promise<void> {
  const ownerId = await getPostOwner(postId)
  if (!ownerId) return
  await sendSocialNotification({
    recipientUserId: ownerId,
    actorUserId,
    type: 'like',
    postId,
  })
}

export async function notifyPostCommented(postId: string, actorUserId: string): Promise<void> {
  const ownerId = await getPostOwner(postId)
  if (!ownerId) return
  await sendSocialNotification({
    recipientUserId: ownerId,
    actorUserId,
    type: 'comment',
    postId,
  })
}

export async function notifyFollowCreated(targetUserId: string, actorUserId: string, status: 'pending' | 'accepted'): Promise<void> {
  await sendSocialNotification({
    recipientUserId: targetUserId,
    actorUserId,
    type: status === 'pending' ? 'follow_request' : 'follow',
  })
}

export async function notifyFollowAccepted(followerUserId: string, actorUserId: string): Promise<void> {
  await sendSocialNotification({
    recipientUserId: followerUserId,
    actorUserId,
    type: 'follow',
  })
}
