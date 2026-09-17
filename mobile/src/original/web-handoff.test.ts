import { describe, expect, it } from 'vitest'
import { findForbiddenMobileModules } from '../../config/bundle-boundaries'
import { matchOriginalRoute } from './routes'

describe('complete mobile product routes', () => {
  it('loads original connected screens for chat, credentials, profile and all administration', () => {
    for (const path of ['/chat', '/coach/apply', '/coach/profile']) {
      expect(matchOriginalRoute(path)?.route.source).toBe(`src/app/(app)${path}/page.tsx`)
      expect(matchOriginalRoute(path)?.route.connectivity).toBe('connected')
    }
    for (const path of ['/admin', '/admin/users', '/admin/content', '/admin/trainers']) {
      expect(matchOriginalRoute(path)?.route.source).toBe(`src/app/(admin)${path}/page.tsx`)
      expect(matchOriginalRoute(path)?.route.connectivity).toBe('connected')
    }
    expect(matchOriginalRoute('/admin/trainers/app-123')?.params).toEqual({ applicationId: 'app-123' })
  })
  it('rejects server implementations while allowing the explicit mobile adapters', () => {
    const forbidden = ['/src/app/actions/chat.ts', '/src/app/actions/trainerApplications.ts', '/src/app/actions/admin.ts', '/src/app/actions/trainerProfile.ts', '/src/lib/auth/admin.ts', '/src/lib/mobile-api/context.ts', '/src/lib/coaching/trainerPhotoOwner.ts', '/src/lib/ai/chatGenerator.ts', '/src/lib/supabase/service.ts']
    expect(findForbiddenMobileModules(forbidden, [])).toEqual(forbidden)
    expect(findForbiddenMobileModules(['/mobile/src/original/actions/chat.ts', '/mobile/src/original/admin/auth.ts'], [])).toEqual([])
  })
})
