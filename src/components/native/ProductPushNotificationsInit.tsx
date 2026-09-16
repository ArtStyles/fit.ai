'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PushNotifications } from '@capacitor/push-notifications'
import { registerProductPushToken } from '@/app/actions/notifications'
import { getPlatform, isNativePlatform } from '@/lib/native/platform'
import { createProductPushLifecycle, getOrCreatePushDeviceId } from '@/lib/native/productPushLifecycle'
import { productPushAvailable } from '@/lib/native/pushCapability'

const lifecycle = createProductPushLifecycle(PushNotifications)

export function ProductPushNotificationsInit() {
  const router = useRouter()

  useEffect(() => {
    if (!isNativePlatform() || !productPushAvailable()) return
    const platform = getPlatform()
    if (platform !== 'android' && platform !== 'ios') return

    void lifecycle.update({ accountId: 'web-session', requestPermission: true,
      registerToken: (token, isCurrent) => isCurrent() ? registerProductPushToken({ token, platform, deviceId: getOrCreatePushDeviceId() }) : Promise.resolve(),
      navigate: url => router.push(url),
    }).catch(() => {})
    return () => { void lifecycle.update(null).catch(() => {}) }
  }, [router])

  return null
}
