import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  const path = fileURLToPath(new URL(relativePath, import.meta.url))
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

describe('route loading skeletons', () => {
  it('matches the real dashboard top bar structure without extra right-side chrome', () => {
    const routeLoading = source('../RouteLoading.tsx')

    expect(routeLoading).toContain('export function DashboardLoading()')
    expect(routeLoading).toContain('contentClassName="max-w-3xl sm:px-6"')
    expect(routeLoading).toContain('data-loading-slot="dashboard-avatar-badge"')
    expect(routeLoading).not.toContain('w-[8.5rem]')
    expect(routeLoading).not.toContain('rounded-full border border-border/60 bg-card/50 p-1.5 pr-3 shadow-sm')
  })

  it('reserves a top-bar action slot in profile loading for the owner settings shortcut', () => {
    const routeLoading = source('../RouteLoading.tsx')

    expect(routeLoading).toContain('data-loading-slot="profile-action"')
  })

  it('keeps the settings index skeleton as a section list', () => {
    const routeLoading = source('../RouteLoading.tsx')

    expect(routeLoading).toContain('export function SettingsLoading()')
    expect(routeLoading).toContain("'Perfil', 'Datos personales', 'Entrenamiento', 'Medidas', 'Notificaciones', 'Idioma', 'Cuenta'")
  })

  it.each([
    ['settings-profile', '../RouteLoading.tsx', 'export function ProfileSettingsLoading()', 'Avatar'],
    ['settings-personal-data', '../RouteLoading.tsx', 'export function PersonalDataSettingsLoading()', 'Altura cm'],
    ['settings-training', '../RouteLoading.tsx', 'export function TrainingSettingsLoading()', 'Objetivo'],
    ['settings-notifications', '../RouteLoading.tsx', 'export function NotificationsSettingsLoading()', 'Recordatorios'],
    ['settings-account', '../RouteLoading.tsx', 'export function AccountSettingsLoading()', 'Eliminar cuenta'],
  ])('defines a detail-form skeleton for %s', (view, relativePath, exportName, expectedCopy) => {
    const routeLoading = source(relativePath)

    expect(routeLoading).toContain('data-loading-view={view}')
    expect(routeLoading).toContain(`view="${view}"`)
    expect(routeLoading).toContain(exportName)
    expect(routeLoading).toContain(expectedCopy)
  })

  it.each([
    ['perfil', 'ProfileSettingsLoading'],
    ['datos', 'PersonalDataSettingsLoading'],
    ['entrenamiento', 'TrainingSettingsLoading'],
    ['notificaciones', 'NotificationsSettingsLoading'],
    ['cuenta', 'AccountSettingsLoading'],
  ])('wires /settings/%s to its specific loading skeleton', (segment, componentName) => {
    const loading = source(`../../../app/(app)/settings/${segment}/loading.tsx`)

    expect(loading).toContain(`import { ${componentName} } from '@/components/feedback/RouteLoading'`)
    expect(loading).toContain(`return <${componentName} />`)
  })
})
