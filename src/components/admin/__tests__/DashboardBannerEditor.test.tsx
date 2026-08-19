import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { DashboardBannerEditor } from '../DashboardBannerEditor'

vi.mock('react-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-dom')>(),
  useFormStatus: () => ({ pending: false }),
}))

vi.mock('@/app/actions/dashboardBanner', () => ({
  saveDashboardBanner: '/admin/content',
}))

function renderEditor(enabled: boolean) {
  return renderToStaticMarkup(
    <I18nProvider language="es" syncDocumentLanguage={false}>
      <DashboardBannerEditor initialBanner={null} enabled={enabled} />
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
