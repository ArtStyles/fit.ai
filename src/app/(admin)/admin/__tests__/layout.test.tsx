import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

async function renderAdminLayout(options: {
  adminError?: Error
  pendingCountError?: Error
} = {}) {
  let shellProps: { adminLabel?: string; pendingTrainerCount?: number } | null = null
  let i18nProps: { language?: string; timeZone?: string | null } | null = null
  const service = { marker: 'admin-service' }
  const requireAdmin = vi.fn(async () => {
    if (options.adminError) throw options.adminError
    return { user: { email: 'admin@example.test' }, service }
  })
  const pendingCountMock = vi.fn(async () => {
    if (options.pendingCountError) throw options.pendingCountError
    return 3
  })

  vi.doMock('@/lib/auth/admin', () => ({ requireAdminUserContext: requireAdmin }))
  vi.doMock('@/lib/auth/adminTrainers', () => ({
    countAdminTrainerApplicationsRequiringAttention: pendingCountMock,
  }))
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: vi.fn(async () => ({
      profile: { language: 'es', timezone: 'America/Havana' },
    })),
  }))
  vi.doMock('@/lib/i18n', () => ({ normalizeLanguage: () => 'es' }))
  vi.doMock('@/lib/workouts/schedule', () => ({
    resolveUserTimeZone: () => 'America/Havana',
  }))
  vi.doMock('@/components/i18n/I18nProvider', () => ({
    I18nProvider: ({ language, timeZone, children }: {
      language: string
      timeZone: string | null
      children: React.ReactNode
    }) => {
      i18nProps = { language, timeZone }
      return <>{children}</>
    },
  }))
  vi.doMock('@/components/admin/AdminShell', () => ({
    AdminShell: ({ adminLabel, pendingTrainerCount, children }: {
      adminLabel: string
      pendingTrainerCount?: number
      children: React.ReactNode
    }) => {
      shellProps = { adminLabel, pendingTrainerCount }
      return <section>{children}</section>
    },
  }))

  const AdminLayout = (await import('../layout')).default
  const html = renderToStaticMarkup(await AdminLayout({ children: <div>contenido-admin</div> }))
  return { html, shellProps, i18nProps, requireAdmin, pendingCountMock, service }
}

it('guards and localizes the dedicated admin shell', async () => {
  const {
    html,
    shellProps,
    i18nProps,
    requireAdmin,
    pendingCountMock,
    service,
  } = await renderAdminLayout()

  expect(requireAdmin).toHaveBeenCalledOnce()
  expect(pendingCountMock).toHaveBeenCalledWith(service)
  expect(shellProps).toMatchObject({
    adminLabel: 'admin@example.test',
    pendingTrainerCount: 3,
  })
  expect(i18nProps).toEqual({ language: 'es', timeZone: 'America/Havana' })
  expect(html).toContain('contenido-admin')
  expect(html).not.toContain('app-shell')
})

it('does not convert an admin authorization failure into route content', async () => {
  await expect(renderAdminLayout({ adminError: new Error('admin required') }))
    .rejects.toThrow('admin required')
})

it('omits only the optional pending count when its source fails', async () => {
  const { html, shellProps } = await renderAdminLayout({
    pendingCountError: new Error('count unavailable'),
  })

  expect(shellProps).toEqual({
    adminLabel: 'admin@example.test',
    pendingTrainerCount: undefined,
  })
  expect(html).toContain('contenido-admin')
})
