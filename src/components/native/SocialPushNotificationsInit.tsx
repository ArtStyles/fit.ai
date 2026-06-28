'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PushNotifications, type Token } from '@capacitor/push-notifications'
import { getPlatform, isNativePlatform } from '@/lib/native/platform'
import {
  registerSocialPushToken,
} from '@/app/actions/pushNotifications'

const DEVICE_ID_KEY = 'fitai:native-device-id'

function getOrCreateDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const next = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    window.localStorage.setItem(DEVICE_ID_KEY, next)
    return next
  } catch {
    return `${Date.now()}-${Math.random()}`
  }
}

function getNotificationUrl(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const value = (data as { url?: unknown }).url
  return typeof value === 'string' && value.startsWith('/') ? value : null
}

export function SocialPushNotificationsInit() {
  const router = useRouter()

  useEffect(() => {
    if (!isNativePlatform()) return
    const platform = getPlatform()
    if (platform !== 'android' && platform !== 'ios') return

    let disposed = false
    const handles: Array<{ remove: () => Promise<void> }> = []

    async function init() {
      try {
        const status = await PushNotifications.checkPermissions()
        const permission = status.receive === 'granted'
          ? status
          : await PushNotifications.requestPermissions()

        if (disposed || permission.receive !== 'granted') return

        const registrationHandle = await PushNotifications.addListener('registration', (token: Token) => {
          void registerSocialPushToken({
            token: token.value,
            platform,
            deviceId: getOrCreateDeviceId(),
          })
        })
        handles.push(registrationHandle)

        const errorHandle = await PushNotifications.addListener('registrationError', () => {
          // Best-effort MVP: si FCM falla, la app sigue funcionando sin push.
        })
        handles.push(errorHandle)

        const actionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', event => {
          const url = getNotificationUrl(event.notification.data)
          if (url) router.push(url)
        })
        handles.push(actionHandle)

        await PushNotifications.register()
      } catch {
        // Best-effort MVP: la app debe seguir usable aunque el registro push falle.
      }
    }

    void init()

    return () => {
      disposed = true
      for (const handle of handles) void handle.remove()
    }
  }, [router])

  return null
}
