import { createElement, isValidElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/(app)/session/[workoutId]/page', () => ({
  default: async (props: {
    params: Promise<{ workoutId: string }>
    searchParams: Promise<Record<string, string | string[]>>
  }) => createElement('output', {
    'data-params': JSON.stringify(await props.params),
    'data-search': JSON.stringify(await props.searchParams),
  }),
}))

import { loadOriginalRoute, matchOriginalRoute } from './routes'

describe('original application routes in the local bundle', () => {
  it('keeps the existing five personal destinations and their real page modules', () => {
    for (const pathname of ['/dashboard', '/plan', '/entrenar', '/progress', '/trainers']) {
      const match = matchOriginalRoute(pathname)
      expect(match?.route.source).toBe(`src/app/(app)${pathname}/page.tsx`)
      expect(match?.params).toEqual({})
    }
  })

  it('does not mistake the new professional routine route for a routine ID', () => {
    expect(matchOriginalRoute('/coach/programs/new')?.route.source)
      .toBe('src/app/(app)/coach/programs/new/page.tsx')
    expect(matchOriginalRoute('/coach/programs/plan-1')?.params)
      .toEqual({ templateId: 'plan-1' })
  })

  it('preserves existing detail parameter names, accepts trailing slash and decodes once', () => {
    expect(matchOriginalRoute('/session/workout%20one/')?.params).toEqual({ workoutId: 'workout one' })
    expect(matchOriginalRoute('/history/log-1')?.params).toEqual({ logId: 'log-1' })
    expect(matchOriginalRoute('/exercises/ex-1')?.params).toEqual({ exerciseId: 'ex-1' })
    expect(matchOriginalRoute('/coach/clients/user-1')?.params).toEqual({ clientId: 'user-1' })
    expect(matchOriginalRoute('/trainers/coach%2520one')?.params).toEqual({ slug: 'coach%20one' })
  })

  it('rejects missing detail IDs, malformed encoding and unknown descendants', () => {
    for (const pathname of ['/session', '/session/%ZZ', '/session/a/extra', '/progress/unknown']) {
      expect(matchOriginalRoute(pathname)).toBeNull()
    }
  })

  it('awaits original pages with promised params and lossless repeated search values', async () => {
    const result = await loadOriginalRoute('/session/workout-1', new URLSearchParams('from=plan&tag=a&tag=b&empty='))
    expect(isValidElement(result)).toBe(true)
    if (!isValidElement<Record<string, string>>(result)) throw new Error('Expected original page result')
    expect(JSON.parse(result.props['data-params'])).toEqual({ workoutId: 'workout-1' })
    expect(JSON.parse(result.props['data-search'])).toEqual({ from: 'plan', tag: ['a', 'b'], empty: '' })
  })
})
