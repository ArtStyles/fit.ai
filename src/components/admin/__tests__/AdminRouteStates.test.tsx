import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AdminRouteError } from '../AdminRouteError'
import { AdminRouteLoading } from '../AdminRouteLoading'

describe('admin route states', () => {
  it('renders an accessible loading geometry without a second shell', () => {
    const html = renderToStaticMarkup(
      <AdminRouteLoading title="Usuarios" cards={4} rows={3} />,
    )

    expect(html).toContain('aria-label="Cargando Usuarios"')
    expect(html).toContain('data-admin-loading-card')
    expect(html).not.toContain('Navegación administrativa')
  })

  it('announces the route error and exposes a 44px retry target', () => {
    const html = renderToStaticMarkup(
      <AdminRouteError
        reset={() => undefined}
        title="No se pudieron cargar los usuarios"
      />,
    )

    expect(html).toContain('role="alert"')
    expect(html).toContain('Reintentar')
    expect(html).toContain('min-h-11')
  })
})
