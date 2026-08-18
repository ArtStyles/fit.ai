import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Children, createElement, isValidElement, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import NotificationsRouteLoading from '@/app/(app)/notifications/loading'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import {
  AccountSettingsLoading,
  LanguageSettingsLoading,
  NotificationsSettingsLoading,
  PersonalDataSettingsLoading,
  ProfileSettingsLoading,
  SettingsLoading,
  TrainingSettingsLoading,
} from '../RouteLoading'

function source(relativePath: string): string {
  const path = fileURLToPath(new URL(relativePath, import.meta.url))
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function renderLoading(Component: ComponentType, language: 'es' | 'en' = 'es'): string {
  return renderToStaticMarkup(createElement(
    I18nProvider,
    {
      language,
      syncDocumentLanguage: false,
      children: createElement(Component),
    },
  ))
}

function renderedGroup(html: string, title: string): string {
  const marker = `data-loading-group="${title}"`
  const start = html.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = html.indexOf('data-loading-group=', start + marker.length)
  return html.slice(start, next === -1 ? html.length : next)
}

function hasForwardRefProp(node: ReactNode): boolean {
  if (!isValidElement(node)) return false

  const element = node as ReactElement<Record<string, unknown>>
  const hasForwardRef = Object.values(element.props).some((value) => (
    typeof value === 'object'
    && value !== null
    && '$$typeof' in value
    && value.$$typeof === Symbol.for('react.forward_ref')
  ))

  return hasForwardRef || Children.toArray(element.props.children as ReactNode).some(hasForwardRefProp)
}

describe('route loading skeletons', () => {
  it('keeps product notification loading icons inside a no-props client boundary', () => {
    const route = NotificationsRouteLoading()
    const html = renderLoading(NotificationsRouteLoading)

    expect(route.props).toEqual({})
    expect(hasForwardRefProp(route)).toBe(false)
    expect(html).toContain('<span class="sr-only">Dashboard</span>')
    expect(html).toContain('Notificaciones')
    expect(html).toContain('Novedades de tu entrenamiento')
    expect(html).toContain('h-11 w-11')
    expect(html).toContain('h-10 w-10')
    expect(html).toContain('lucide-bell h-5 w-5')
    expect(html).toContain('mt-8')
    expect(html).not.toContain('h-11 w-11 shrink-0 rounded-xl bg-violet-500/15')
    expect(html.match(/animation-delay:/g)).toHaveLength(5)
  })

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

  it('keeps social controls out of the rendered profile settings loading boundary', () => {
    const html = renderLoading(ProfileSettingsLoading)

    expect(html).toContain('Avatar')
    expect(html).not.toContain('Usuario')
    expect(html).not.toContain('Privacidad')
  })

  it('keeps social preferences out of the rendered notifications loading boundary', () => {
    const html = renderLoading(NotificationsSettingsLoading)

    expect(html).toContain('Recordatorios')
    expect(html).toContain('Avisos de Vekira')
    expect(html).not.toContain('Actividad social')
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

  it('renders 3/1/2/1 settings rows and never speculates about Administration', () => {
    const html = renderLoading(SettingsLoading)

    for (const [title, expectedRows] of [
      ['Tu perfil', 3],
      ['Tu entrenamiento', 1],
      ['Aplicación', 2],
      ['Acceso y seguridad', 1],
    ] as const) {
      expect(renderedGroup(html, title).match(/data-loading-row="true"/g)).toHaveLength(expectedRows)
    }
    expect(html).not.toContain('Administración')
  })

  it('renders the grouped settings skeleton in English', () => {
    const html = renderLoading(SettingsLoading, 'en')

    for (const label of ['Settings', 'Your account preferences', 'Your profile', 'Your training', 'Application', 'Access and security']) {
      expect(html).toContain(label)
    }
    expect(html).not.toContain('Tu perfil')
    expect(html).not.toContain('Administration')
  })

  it.each([
    ['settings-profile', ProfileSettingsLoading, 'Avatar'],
    ['settings-personal-data', PersonalDataSettingsLoading, 'Altura'],
    ['settings-training', TrainingSettingsLoading, 'Objetivo'],
    ['settings-notifications', NotificationsSettingsLoading, 'Recordatorios'],
    ['settings-account', AccountSettingsLoading, 'Eliminar cuenta'],
  ] as const)('renders a detail-form skeleton for %s', (view, Component, expectedCopy) => {
    const html = renderLoading(Component)

    expect(html).toContain(`data-loading-view="${view}"`)
    expect(html).toContain(expectedCopy)
  })

  it('matches the four training preference sections without a CSV equipment field', () => {
    const html = renderLoading(TrainingSettingsLoading)

    expect(html.match(/data-loading-section="training"/g)).toHaveLength(4)
    expect(html).not.toContain('Equipamiento disponible')
  })

  it('matches the personal-data fields and separates the read-only current-weight summary', () => {
    const html = renderLoading(PersonalDataSettingsLoading)

    for (const label of ['Altura', 'Fecha de nacimiento', 'Género', 'Peso actual']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('data-loading-section="personal-data"')
    expect(html).toContain('data-loading-section="current-weight"')
    expect(html).not.toContain('Peso kg')
  })

  it('localizes the personal-data loading skeleton in English', () => {
    const html = renderLoading(PersonalDataSettingsLoading, 'en')

    for (const label of ['Personal information', 'Height', 'Date of birth', 'Gender', 'Current weight']) {
      expect(html).toContain(label)
    }
    expect(html).not.toContain('Datos personales')
  })

  it('localizes the detail shell plus Profile, Notifications and Account loading copy in English', () => {
    const profile = renderLoading(ProfileSettingsLoading, 'en')
    expect(profile).toContain('aria-label="Loading Profile"')
    expect(profile).toContain('Settings')
    expect(profile).toContain('Name')
    expect(profile).not.toContain('Cargando Perfil')

    const notifications = renderLoading(NotificationsSettingsLoading, 'en')
    for (const label of ['Loading Notifications', 'Reminders', 'Preferred time', 'Active days', 'Vekira alerts']) {
      expect(notifications).toContain(label)
    }
    expect(notifications).not.toContain('Recordatorios')

    const account = renderLoading(AccountSettingsLoading, 'en')
    for (const label of ['Loading Account', 'Access account', 'Email address', 'Session', 'Documents', 'Danger zone', 'Delete account']) {
      expect(account).toContain(label)
    }
    expect(account).not.toContain('Cargando Cuenta')
  })

  it('matches the four account preference groups while loading', () => {
    const html = renderLoading(AccountSettingsLoading)

    for (const label of ['Cuenta de acceso', 'Sesión', 'Documentos', 'Zona peligrosa']) {
      expect(html).toContain(label)
    }
  })

  it('reserves feedback space for the language save state while loading', () => {
    const html = renderLoading(LanguageSettingsLoading)

    expect(html).toContain('data-loading-slot="language-save-status"')
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
