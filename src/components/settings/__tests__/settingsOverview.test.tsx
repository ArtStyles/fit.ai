import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { UserRound } from 'lucide-react'
import { SettingsNavGroup } from '../SettingsNavGroup'

const { mockRequireAppUserContext } = vi.hoisted(() => ({
  mockRequireAppUserContext: vi.fn(),
}))

vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: mockRequireAppUserContext,
}))

import SettingsPage from '@/app/(app)/settings/page'

describe('SettingsNavGroup', () => {
  it('renders a semantic group with descriptive links and touch targets', () => {
    const html = renderToStaticMarkup(
      <SettingsNavGroup
        title="Tu perfil"
        entries={[{ href: '/settings/perfil', label: 'Perfil', description: 'Foto y nombre', icon: UserRound }]}
      />,
    )

    expect(html).toContain('Tu perfil')
    expect(html).toContain('Foto y nombre')
    expect(html).toContain('href="/settings/perfil"')
    expect(html).toContain('min-h-11')
  })

  it('isolates administration from non-admin profiles', async () => {
    mockRequireAppUserContext.mockResolvedValue({
      user: { email: 'member@example.com' },
      profile: { language: 'es', is_admin: false },
    })

    const memberHtml = renderToStaticMarkup(await SettingsPage())

    expect(memberHtml).not.toContain('Administración')

    mockRequireAppUserContext.mockResolvedValue({
      user: { email: 'admin@example.com' },
      profile: { language: 'es', is_admin: true },
    })

    const adminHtml = renderToStaticMarkup(await SettingsPage())

    expect(adminHtml).toContain('href="/admin"')
    expect(adminHtml).toContain('Administración')
  })
})
