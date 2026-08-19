import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import type { DashboardBannerData } from '@/lib/dashboard/banner'
import { DashboardBannerEditor } from '../DashboardBannerEditor'

vi.mock('react-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-dom')>(),
  useFormStatus: () => ({ pending: false }),
}))

vi.mock('@/app/actions/dashboardBanner', () => ({
  saveDashboardBanner: '/admin/content',
}))

function renderEditor(enabled: boolean, initialBanner: DashboardBannerData | null = null) {
  return renderToStaticMarkup(
    <I18nProvider language="es" syncDocumentLanguage={false}>
      <DashboardBannerEditor initialBanner={initialBanner} enabled={enabled} />
    </I18nProvider>,
  )
}

it('explains when Content is unavailable without exposing migration details', () => {
  const html = renderEditor(false)

  expect(html).toContain('Contenido no disponible')
  expect(html).not.toContain('migración 030')
})

it('labels a new editable banner before its first save', () => {
  const html = renderEditor(true)

  expect(html).toContain('Banner sin configurar')
  expect(html).toContain('Guardar banner')
})

it('exposes 44px image-picker, remove, and save targets with visible keyboard focus', () => {
  const html = renderEditor(true, {
    slot: 'dashboard-primary',
    kind: 'announcement',
    title: 'Aviso operativo',
    description: null,
    image_url: 'https://cdn.example.test/banner.webp',
    cta_label: null,
    cta_href: null,
    status: 'draft',
    starts_on: null,
    ends_on: null,
    updated_at: '2026-08-19T12:00:00.000Z',
  })

  const picker = (html.match(/<label\b[^>]*>[^<]*<svg[^>]*>[\s\S]*?Cambiar imagen/) ?? [])[0] ?? ''
  const buttons = html.match(/<button\b[^>]*>/g) ?? []
  const removeButton = buttons.find(button => button.includes('type="button"')) ?? ''

  expect(picker).toContain('min-h-11')
  expect(picker).toContain('min-w-11')
  expect(picker).toContain('focus-within:ring-2')
  expect(removeButton).toContain('min-h-11')
  expect(removeButton).toContain('min-w-11')
  expect(buttons.every(button => button.includes('min-h-11'))).toBe(true)
})
