import 'server-only'
import { avatarStoragePath } from '@/lib/images/avatar'
import { createServiceClient } from '@/lib/supabase/service'

function matchesOwnedPublicPhotoUrl(candidate: string, expected: string): boolean {
  try {
    const candidateUrl = new URL(candidate), expectedUrl = new URL(expected)
    return candidateUrl.protocol === 'https:' && !candidateUrl.username && !candidateUrl.password && !candidateUrl.hash
      && candidateUrl.origin === expectedUrl.origin && candidateUrl.pathname === expectedUrl.pathname
      && (candidateUrl.search === '' || /^\?v=[0-9]+$/.test(candidateUrl.search))
  } catch { return false }
}

export async function isOwnedTrainerPhoto(userId: string, photoUrl: string): Promise<boolean> {
  try {
    const service = createServiceClient(), path = avatarStoragePath(userId)
    const bucket = service.storage.from('avatars')
    if (!matchesOwnedPublicPhotoUrl(photoUrl, bucket.getPublicUrl(path).data.publicUrl)) return false
    const { data, error } = await bucket.list(userId, { limit: 2, search: 'avatar.webp' })
    return !error && (data ?? []).some(object => object.name === 'avatar.webp')
  } catch { return false }
}
