import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/trainers/application-1' }))
vi.mock('@/components/branding/VekiraLogo', () => ({ VekiraLogo: () => <i data-logo /> }))
vi.mock('@/components/navigation/PendingLink', () => ({
  PendingLink: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={href} {...props}>{children}</a>,
}))

import { AdminShell } from '../AdminShell'
import { AdminPageHeader } from '../AdminPageHeader'

describe('AdminShell', () => {
  it('renders admin-only desktop and mobile navigation with a real exit', () => {
    const html = renderToStaticMarkup(
      <AdminShell adminLabel="admin@example.test" pendingTrainerCount={3}>
        <main>Contenido</main>
      </AdminShell>,
    )

    expect(html).toContain('aria-label="Navegación administrativa"')
    expect(html).toContain('href="/admin/users"')
    expect(html).toContain('href="/admin/content"')
    expect(html).toContain('href="/dashboard"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('>3<')
    expect(html).toContain('id="app-main-content"')
    expect(html).not.toContain('WorkspaceSwitcher')
  })

  it('gives the shared page-header back link a focused 44px target', () => {
    const html = renderToStaticMarkup(
      <AdminPageHeader
        title="Expediente privado"
        backHref="/admin/trainers"
        backLabel="Volver a entrenadores"
      />,
    )

    expect(html).toMatch(/<a[^>]*href="\/admin\/trainers"[^>]*class="[^"]*min-h-11[^"]*min-w-11/)
    expect(html).toContain('focus-visible:ring-2')
  })
})
