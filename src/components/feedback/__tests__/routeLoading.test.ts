import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { SettingsLoading } from '../RouteLoading'

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

  it('keeps social controls out of the profile settings loading boundary', () => {
    const routeLoading = source('../RouteLoading.tsx')
    const profileLoading = routeLoading.slice(
      routeLoading.indexOf('export function ProfileSettingsLoading()'),
      routeLoading.indexOf('export function PersonalDataSettingsLoading()'),
    )

    expect(profileLoading).not.toContain('Usuario')
    expect(profileLoading).not.toContain('Privacidad')
  })

  it('keeps social preferences out of the notifications loading boundary', () => {
    const routeLoading = source('../RouteLoading.tsx')
    const notificationsLoading = routeLoading.slice(
      routeLoading.indexOf('export function NotificationsSettingsLoading()'),
      routeLoading.indexOf('export function AccountSettingsLoading()'),
    )

    expect(notificationsLoading).toContain('Recordatorios')
    expect(notificationsLoading).toContain('Avisos de Vekira')
    expect(notificationsLoading).not.toContain('Actividad social')
  })

  it('keeps notification controls at the 44px touch target', () => {
    const productPreferences = source('../../settings/ProductNotificationPreferences.tsx')
    const socialPreferences = source('../../settings/SocialNotificationPreferences.tsx')
    const workoutReminders = source('../../settings/WorkoutReminders.tsx')

    expect(productPreferences).toContain('min-h-11 min-w-11')
    expect(socialPreferences).toContain('min-h-11 min-w-11')
    expect(workoutReminders).toContain('min-h-11 min-w-11')
  })

  it('keeps compact visual tracks inside the larger social and reminder switch targets', () => {
    const socialPreferences = source('../../settings/SocialNotificationPreferences.tsx')
    const workoutReminders = source('../../settings/WorkoutReminders.tsx')

    expect(socialPreferences).toContain("'relative block h-7 w-12 rounded-full transition-colors'")
    expect(workoutReminders).toContain("'relative block h-7 w-12 rounded-full transition-colors'")
  })

  it('keeps the settings index skeleton grouped like the overview', () => {
    const routeLoading = source('../RouteLoading.tsx')

    expect(routeLoading).toContain('export function SettingsLoading()')
    for (const label of ['Tu perfil', 'Tu entrenamiento', 'Aplicación', 'Acceso y seguridad']) {
      expect(routeLoading).toContain(label)
    }
  })

  it('renders the grouped settings skeleton in English', () => {
    const html = renderToStaticMarkup(createElement(
      I18nProvider,
      { language: 'en', syncDocumentLanguage: false, children: createElement(SettingsLoading) },
    ))

    for (const label of ['Settings', 'Your account preferences', 'Your profile', 'Your training', 'Application', 'Access and security']) {
      expect(html).toContain(label)
    }
    expect(html).not.toContain('Tu perfil')
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
