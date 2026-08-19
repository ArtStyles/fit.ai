import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { AdminUserRecord } from '@/lib/auth/admin'
import AdminUsersPage from '../page'

const { listAdminUsersMock } = vi.hoisted(() => ({
  listAdminUsersMock: vi.fn(),
}))

vi.mock('react-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-dom')>(),
  useFormStatus: () => ({ pending: false }),
}))

vi.mock('@/app/actions/admin', () => ({
  reactivateUser: '/admin/users',
  setUserSubscription: '/admin/users',
  suspendUser: '/admin/users',
}))
vi.mock('@/lib/auth/admin', () => ({ listAdminUsers: listAdminUsersMock }))
vi.mock('@/lib/auth/server', () => ({
  requireAppUserContext: async () => ({ profile: { timezone: 'America/Havana' } }),
}))
vi.mock('@/lib/workouts/schedule', () => ({
  resolveUserTimeZone: () => 'America/Havana',
}))

const users: AdminUserRecord[] = [
  {
    id: 'ana-pro',
    email: 'ana@example.test',
    fullName: 'Ana Pérez',
    username: 'ana',
    avatarUrl: null,
    subscriptionTier: 'pro',
    accountStatus: 'active',
    suspensionReason: null,
    suspendedUntil: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    lastSignInAt: '2026-08-18T12:00:00.000Z',
    isOwner: false,
  },
  {
    id: 'bea-free',
    email: 'bea@example.test',
    fullName: 'Beatriz Ruiz',
    username: 'bea',
    avatarUrl: null,
    subscriptionTier: 'free',
    accountStatus: 'suspended',
    suspensionReason: 'Revisión manual',
    suspendedUntil: null,
    createdAt: '2026-07-01T12:00:00.000Z',
    lastSignInAt: null,
    isOwner: false,
  },
]

it('owns query filters and renders the real account directory and action controls', async () => {
  listAdminUsersMock.mockResolvedValue({ users, suspensionEnabled: true })

  const html = renderToStaticMarkup(await AdminUsersPage({
    searchParams: { q: '  ana  ', status: 'active', tier: 'pro' },
  }))

  expect(html).toContain('Cuentas, suscripciones y acceso')
  expect(html).toContain('aria-label="Resumen de cuentas"')
  expect(html).toContain('Usuarios Pro')
  expect(html).toContain('name="q"')
  expect(html).toContain('value="ana"')
  expect(html).toContain('<option value="active" selected="">Activas</option>')
  expect(html).toContain('<option value="pro" selected="">Pro</option>')
  expect(html).toContain('Ana Pérez')
  expect(html).not.toContain('Beatriz Ruiz')
  expect(html).toContain('Activa')
  expect(html).toContain('Cancelar Pro')
  expect(html).toContain('Suspender')
  expect(html).not.toContain('Guardar banner')
})

it('renders suspension as unavailable rather than active or zero', async () => {
  listAdminUsersMock.mockResolvedValue({ users, suspensionEnabled: false })

  const html = renderToStaticMarkup(await AdminUsersPage({ searchParams: {} }))

  expect(html).toContain('El estado de suspensión no está disponible en este momento.')
  expect(html).toContain('No disponible')
  expect(html).not.toContain('>Suspendida<')
  expect(html).not.toContain('>Activa<')
})
