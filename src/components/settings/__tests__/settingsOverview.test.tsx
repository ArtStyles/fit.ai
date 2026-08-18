import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingsNavGroup } from '../SettingsNavGroup'

const { mockGetTrainerAccess, mockRequireAppUserContext } = vi.hoisted(() => ({
  mockGetTrainerAccess: vi.fn(),
  mockRequireAppUserContext: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: mockRequireAppUserContext,
}))
vi.mock('@/lib/coaching/access', () => ({
  getTrainerAccess: mockGetTrainerAccess,
}))

import SettingsPage from '@/app/(app)/settings/page'

describe('SettingsNavGroup', () => {
  it('renders a semantic group with descriptive links and touch targets', () => {
    const html = renderToStaticMarkup(
      <SettingsNavGroup
        title="Tu perfil"
        entries={[{ href: '/settings/perfil', label: 'Perfil', description: 'Foto y nombre', icon: 'user-round' }]}
      />,
    )

    expect(html).toContain('Tu perfil')
    expect(html).toContain('Foto y nombre')
    expect(html).toContain('href="/settings/perfil"')
    expect(html).toContain('min-h-11')
  })

  it('isolates administration from non-admin profiles', async () => {
    mockGetTrainerAccess.mockResolvedValue({ granted: false, reason: 'missing_profile' })
    mockRequireAppUserContext.mockResolvedValue({
      user: { id: 'member', email: 'member@example.com' },
      profile: { language: 'es', is_admin: false },
      supabase: {},
    })

    const memberHtml = renderToStaticMarkup(await SettingsPage())

    expect(memberHtml).not.toContain('Administración')

    mockRequireAppUserContext.mockResolvedValue({
      user: { id: 'admin', email: 'admin@example.com' },
      profile: { language: 'es', is_admin: true },
      supabase: {},
    })

    const adminHtml = renderToStaticMarkup(await SettingsPage())

    expect(adminHtml).toContain('href="/admin"')
    expect(adminHtml).toContain('Administración')
  })
})
