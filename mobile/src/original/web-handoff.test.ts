import { describe, expect, it } from 'vitest'
import { createWebHandoffUrl } from './web-handoff'
import { findForbiddenMobileModules } from '../../config/bundle-boundaries'
import { matchOriginalRoute } from './routes'

describe('explicit authenticated web handoffs', () => {
  it('uses only configured HTTPS origin and exact destinations without forwarding identity', () => {
    for (const path of ['/coach/apply', '/coach/profile', '/chat', '/admin']) expect(createWebHandoffUrl(path, 'https://vekira.example.invalid')).toBe(`https://vekira.example.invalid${path}`)
    for (const origin of ['', undefined, 'http://host.test', 'javascript:alert(1)', 'https://user:secret@host.test', 'https://host.test?token=x', 'https://host.test/#id', 'https://host.test/path']) expect(createWebHandoffUrl('/chat', origin)).toBeNull()
    for (const path of ['//evil.test', 'https://evil.test', '/chat?access_token=secret', '/coach/../admin', '/admin/users', '/coach/profile#token']) expect(createWebHandoffUrl(path, 'https://vekira.example.invalid')).toBeNull()
  })
  it('routes chat, admin and credentials away from server action forms while preserving services', () => {
    for (const path of ['/chat', '/admin', '/coach/apply']) expect(matchOriginalRoute(path)?.route.source).toBe('mobile/src/original/WebHandoffScreen.tsx')
    expect(matchOriginalRoute('/coach/profile')?.route.source).toBe('src/app/(app)/coach/profile/page.tsx')
    expect(matchOriginalRoute('/coach/services')?.route.source).toBe('src/app/(app)/coach/services/page.tsx')
  })
  it('rejects server credentials, credential actions and mock chat generators at bundle generation', () => {
    const forbidden = ['/src/app/actions/chat.ts', '/src/app/actions/trainerApplications.ts', '/src/lib/coaching/trainerPhotoOwner.ts', '/src/lib/ai/chatGenerator.ts', '/src/lib/ai/mock-chatGenerator.ts', '/src/lib/supabase/service.ts']
    expect(findForbiddenMobileModules(forbidden, [])).toEqual(forbidden)
    expect(findForbiddenMobileModules(['/src/app/actions/trainerServices.ts', '/src/app/actions/trainerProfile.ts', '/mobile/src/original/WebHandoffScreen.tsx'], [])).toEqual([])
  })
})
