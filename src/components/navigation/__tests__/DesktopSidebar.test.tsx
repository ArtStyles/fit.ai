import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ usePathname: () => '/coach' }))
vi.mock('@/components/branding/VekiraLogo', () => ({ VekiraLogo: () => <i>logo</i> }))
vi.mock('@/components/i18n/I18nProvider', () => ({ useI18n: () => ({ t: (value: string) => value }) }))
vi.mock('../PendingLink', () => ({
  PendingLink: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}))
vi.mock('../WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: ({ workspace }: { workspace: string }) => <i data-workspace-switcher={workspace} />,
}))

import { DesktopSidebar } from '../DesktopSidebar'

const navItems = [{ href: '/coach', label: 'Resumen' }] as const

describe('DesktopSidebar workspace destinations', () => {
  it('keeps the logo in the coach workspace and shows its selector', () => {
    const html = renderToStaticMarkup(<DesktopSidebar navItems={navItems} workspace="coach" />)

    expect(html).toContain('href="/coach"')
    expect(html).toContain('data-workspace-switcher="coach"')
    expect(html).not.toContain('href="/dashboard"')
  })

  it('keeps the personal destination and hides the selector without trainer access', () => {
    const html = renderToStaticMarkup(<DesktopSidebar navItems={navItems} />)

    expect(html).toContain('href="/dashboard"')
    expect(html).not.toContain('data-workspace-switcher')
  })
})
