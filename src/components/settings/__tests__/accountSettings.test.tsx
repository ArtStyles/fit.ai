import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/settings/DeleteAccountSection', () => ({
  DeleteAccountSection: () => <div>Eliminar mi cuenta</div>,
}))
vi.mock('@/app/(auth)/actions', () => ({ signOut: vi.fn() }))

async function renderAccountSettings(language: 'es' | 'en') {
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: async () => ({
      user: { id: 'user-1', email: 'ana@example.com' },
      profile: { language },
    }),
  }))

  const Page = (await import('@/app/(app)/settings/cuenta/page')).default
  return renderToStaticMarkup(await Page())
}

describe('AccountSettingsPage', () => {
  it('groups Spanish account preferences and keeps Spanish legal routes', async () => {
    const html = await renderAccountSettings('es')

    for (const heading of ['Cuenta de acceso', 'Sesión', 'Documentos', 'Zona peligrosa']) {
      expect(html).toContain(heading)
    }
    expect(html).toContain('href="/es/privacidad?from=settings-account"')
    expect(html).toContain('href="/es/terminos?from=settings-account"')
  })

  it('uses English legal routes for English accounts', async () => {
    const html = await renderAccountSettings('en')

    expect(html).toContain('Access account')
    expect(html).toContain('href="/en/privacy?from=settings-account"')
    expect(html).toContain('href="/en/terms?from=settings-account"')
  })
})

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})
