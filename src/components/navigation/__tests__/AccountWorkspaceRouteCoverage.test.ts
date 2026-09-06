import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

describe('top-bar account composition contract', () => {
  it('groups feed and chat actions instead of appending an unrelated sibling', () => {
    expect(read('src/app/(app)/feed/page.tsx')).toContain('actions=')
    expect(read('src/components/chat/ChatContainer.tsx')).toContain('actions=')
  })

  it('owns the exercise account trigger inside its multi-row toolbar', () => {
    const source = read('src/app/(app)/exercises/page.tsx')
    expect(source).toContain('accountSlot="custom"')
    expect(source).toContain('<AccountWorkspaceMenu surface="topbar"')
  })

  it.each([
    'src/components/session/SessionHeader.tsx',
    'src/app/(app)/plans/generate/page.tsx',
    'src/app/(app)/feed/new/page.tsx',
  ])('%s explicitly hides account access', source => {
    expect(read(source)).toContain('accountSlot="hidden"')
  })

  it('hides account access in SessionLoading only', () => {
    const source = read('src/components/feedback/RouteLoading.tsx')
    const start = source.indexOf('export function SessionLoading')
    const end = source.indexOf('export function ExercisesLoading')
    const session = source.slice(start, end)
    expect(session).toContain('accountSlot="hidden"')
  })

  it('keeps the parent loading route-aware without a duplicate avatar', () => {
    const provider = read('src/components/navigation/AccountWorkspaceProvider.tsx')
    const topBar = read('src/components/navigation/FixedTopBar.tsx')
    const appLoading = read('src/app/(app)/loading.tsx')
    expect(provider).toContain('isImmersiveWorkspaceRoute(pathname)')
    expect(topBar).toContain('!accountContext.immersiveRoute')
    expect(appLoading).not.toContain('h-10 w-10 rounded-full')
  })
})
