import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { AdminUserRecord } from '@/lib/auth/admin'
import { AdminUserDirectory } from '../AdminUserDirectory'

vi.mock('react-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-dom')>(),
  useFormStatus: () => ({ pending: false }),
}))

vi.mock('@/app/actions/admin', () => ({
  reactivateUser: '/admin/users',
  setUserSubscription: '/admin/users',
  suspendUser: '/admin/users',
}))

const directoryUsers: AdminUserRecord[] = [
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
    suspendedUntil: '2026-09-01T12:00:00.000Z',
    createdAt: '2026-07-01T12:00:00.000Z',
    lastSignInAt: null,
    isOwner: false,
  },
]

function interactiveButtons(html: string): string[] {
  return html.match(/<button\b[^>]*>/g) ?? []
}

it('shows account summary, filter values, rows, statuses, dates, and real action controls', () => {
  const html = renderToStaticMarkup(
    <AdminUserDirectory
      users={directoryUsers}
      suspensionEnabled
      filters={{ query: 'Ana', status: 'active', tier: 'pro' }}
      timeZone="America/Havana"
    />,
  )

  expect(html).toContain('aria-label="Resumen de cuentas"')
  expect(html).toContain('Usuarios Pro')
  expect(html).toContain('name="q"')
  expect(html).toContain('value="Ana"')
  expect(html).toContain('<option value="active" selected="">Activas</option>')
  expect(html).toContain('<option value="pro" selected="">Pro</option>')
  expect(html).toContain('Ana Pérez')
  expect(html).toContain('@ana')
  expect(html).not.toContain('Beatriz Ruiz')
  expect(html).toContain('Activa')
  expect(html).toContain('Creada: 1 ago 2026')
  expect(html).toContain('18 ago 2026')
  expect(html).toContain('Cancelar Pro')
  expect(html).toContain('Suspender')
  expect(interactiveButtons(html).length).toBeGreaterThan(0)
  expect(interactiveButtons(html).every(button => button.includes('min-h-11'))).toBe(true)
})

it('shows every matching account and keeps each real action set available', () => {
  const html = renderToStaticMarkup(
    <AdminUserDirectory
      users={directoryUsers}
      suspensionEnabled
      filters={{ query: '', status: 'all', tier: 'all' }}
      timeZone="America/Havana"
    />,
  )

  expect(html).toContain('Ana Pérez')
  expect(html).toContain('Beatriz Ruiz')
  expect(html).toContain('Suspendida')
  expect(html).toContain('Motivo: Revisión manual')
  expect(html).toContain('Hasta: 1 sept 2026')
  expect(html).toContain('Creada: 1 jul 2026')
  expect(html).toContain('Sin actividad')
  expect(html).toContain('Cancelar Pro')
  expect(html).toContain('Suspender')
  expect(html).toContain('Activar Pro')
  expect(html).toContain('Reactivar')
  expect(interactiveButtons(html).every(button => button.includes('min-h-11'))).toBe(true)
})

it('shows the empty state separately', () => {
  const html = renderToStaticMarkup(
    <AdminUserDirectory
      users={[]}
      suspensionEnabled
      filters={{ query: '', status: 'all', tier: 'all' }}
      timeZone="America/Havana"
    />,
  )

  expect(html).toContain('No se encontraron cuentas')
})

it('never presents suspension as active or zero when suspension data is unavailable', () => {
  const html = renderToStaticMarkup(
    <AdminUserDirectory
      users={directoryUsers}
      suspensionEnabled={false}
      filters={{ query: '', status: 'suspended', tier: 'all' }}
      timeZone="America/Havana"
    />,
  )

  expect(html).toContain('El estado de suspensión no está disponible en este momento.')
  expect(html).toContain('No disponible')
  expect(html).toContain('Ana Pérez')
  expect(html).toContain('Beatriz Ruiz')
  expect(html).toMatch(/<select[^>]*name="status"[^>]*disabled=""/)
  expect(html).toMatch(/<select[^>]*name="status"[^>]*aria-describedby="suspension-status-unavailable"/)
  expect(html).toContain('<option value="all" selected="">Todos los estados</option>')
  expect(html).not.toContain('>Suspendida<')
  expect(html).not.toContain('>Activa<')
  expect(html).not.toContain('Motivo: Revisión manual')
  expect(html).not.toContain('Hasta: 1 sept 2026')
  expect(html).not.toContain('Reactivar')
  expect(html).not.toContain('Suspender')
})
