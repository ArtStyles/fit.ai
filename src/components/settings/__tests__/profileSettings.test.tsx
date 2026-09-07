import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/profile/AvatarUploader', () => ({
  AvatarUploader: () => <div aria-label="Foto de perfil" />,
}))
vi.mock('@/components/settings/UsernameField', () => ({
  UsernameField: () => <p>Nombre de usuario</p>,
}))
vi.mock('@/components/settings/PrivacyToggle', () => ({
  PrivacyToggle: () => <p>Cuenta privada</p>,
}))
vi.mock('@/components/feedback/SubmitButton', () => ({
  SubmitButton: ({ children }: { children: React.ReactNode }) => <button type="submit">{children}</button>,
}))
vi.mock('@/components/settings/ProfileNameForm', () => ({
  ProfileNameForm: () => <p>Nombre</p>,
}))

async function renderProfileSettings(communityEnabled: boolean) {
  vi.doMock('@/lib/features/community', () => ({
    isCommunityEnabled: () => communityEnabled,
  }))
  vi.doMock('@/lib/auth/server', () => ({
    requireAppUserContext: async () => ({
      user: { id: 'user-1', email: 'ana@example.com' },
      profile: {
        language: 'es', full_name: 'Ana Pérez', avatar_url: null,
        username: 'ana', is_private: true,
      },
    }),
  }))

  const Page = (await import('@/app/(app)/settings/perfil/page')).default
  return renderToStaticMarkup(await Page())
}

describe('ProfilePage', () => {
  it('keeps avatar editing in personal profile settings', async () => {
    const html = await renderProfileSettings(false)

    expect(html).toContain('aria-label="Foto de perfil"')
  })

  it('hides every social control while Community is disabled', async () => {
    const html = await renderProfileSettings(false)

    expect(html).toContain('Ana Pérez')
    expect(html).toContain('ana@example.com')
    expect(html).not.toContain('Nombre de usuario')
    expect(html).not.toContain('Cuenta privada')
    expect(html).not.toContain('Ver mi perfil')
  })

  it('keeps social controls when Community is enabled', async () => {
    const html = await renderProfileSettings(true)

    expect(html).toContain('Nombre de usuario')
    expect(html).toContain('Cuenta privada')
    expect(html).toContain('Ver mi perfil')
  })
})

afterEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})
