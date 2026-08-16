import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { SettingsChoiceGroup } from '../SettingsChoiceGroup'
import { SettingsField } from '../SettingsField'
import { SettingsSection } from '../SettingsSection'
import { SettingsStatus } from '../SettingsStatus'
import { SettingsSwitchRow } from '../SettingsSwitchRow'
import { SettingsScreen } from '../SettingsScreen'

describe('settings primitives', () => {
  it('associates help and error copy with a field', () => {
    const html = renderToStaticMarkup(
      <SettingsField id="height" label="Altura" help="En centímetros" error="Valor inválido">
        <input id="height" aria-invalid />
      </SettingsField>,
    )

    expect(html).toContain('aria-describedby="height-help height-error"')
    expect(html).toContain('id="height-error"')
    expect(html).toContain('role="alert"')
  })

  it('exposes pressed state and 44px targets', () => {
    const html = renderToStaticMarkup(
      <SettingsChoiceGroup
        label="Duración"
        options={[{ value: 30, label: '30 min' }, { value: 60, label: '1 hora' }]}
        selected={[60]}
        multiple={false}
        onToggle={vi.fn()}
      />,
    )

    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('min-h-11')
    expect(html).toContain('<fieldset')
  })

  it('announces status without relying on color', () => {
    const html = renderToStaticMarkup(<SettingsStatus tone="error">No se pudo guardar.</SettingsStatus>)

    expect(html).toContain('role="alert"')
    expect(html).toContain('No se pudo guardar.')
  })

  it('renders a titled section and preserves the supplied switch control', () => {
    const html = renderToStaticMarkup(
      <SettingsSection title="Privacidad" description="Gestiona quién puede ver tu perfil.">
        <SettingsSwitchRow
          title="Cuenta privada"
          control={<button type="button" role="switch" aria-checked="false">Activar</button>}
        />
      </SettingsSection>,
    )

    expect(html).toContain('Privacidad')
    expect(html).toContain('Gestiona quién puede ver tu perfil.')
    expect(html).toContain('role="switch"')
  })

  it('renders optional screen introduction copy before content', () => {
    const html = renderToStaticMarkup(
      <SettingsScreen
        title="Perfil"
        eyebrow="Ajustes"
        description="Actualiza cómo te reconoce Vekira."
        backHref="/settings"
        backLabel="Ajustes"
        icon={<span aria-hidden="true" />}
      >
        <p>Contenido</p>
      </SettingsScreen>,
    )

    expect(html).toContain('aria-label="Perfil"')
    expect(html).toContain('Ajustes')
    expect(html).toContain('Actualiza cómo te reconoce Vekira.')
  })
})
