import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('@/components/i18n/I18nProvider', () => ({
  useI18n: () => ({ t: (value: string) => value }),
}))
vi.mock('../PendingLink', () => ({
  PendingLink: ({
    href,
    children,
    showSpinner: _showSpinner,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; showSpinner?: boolean }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('../WorkspaceSwitcher', () => ({ WorkspaceSwitcher: () => null }))

import { BottomNav } from '../BottomNav'
import { FixedTopBar } from '../FixedTopBar'

describe('persistent app chrome surface', () => {
  it('renders both mobile bars on the shared lighter surface', () => {
    const expectedSurface = 'bg-[hsl(var(--surface-1)/0.95)]'
    const topBar = renderToStaticMarkup(<FixedTopBar>Vekira</FixedTopBar>)
    const bottomBar = renderToStaticMarkup(
      <BottomNav navItems={[{ href: '/dashboard', label: 'Inicio' }]} />,
    )

    expect(topBar).toContain(expectedSurface)
    expect(bottomBar).toContain(expectedSurface)
  })
})
