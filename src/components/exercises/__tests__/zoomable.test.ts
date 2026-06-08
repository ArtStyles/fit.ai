import { describe, it, expect } from 'vitest'
import { canZoom } from '../zoomable'

describe('canZoom', () => {
  it('es true con zoomable, imagen real y sin error', () => {
    expect(canZoom({ zoomable: true, kind: 'image', errored: false })).toBe(true)
  })

  it('es false si zoomable no está activo', () => {
    expect(canZoom({ zoomable: false, kind: 'image', errored: false })).toBe(false)
    expect(canZoom({ zoomable: undefined, kind: 'image', errored: false })).toBe(false)
  })

  it('es false con placeholder (sin imagen real)', () => {
    expect(canZoom({ zoomable: true, kind: 'placeholder', errored: false })).toBe(false)
  })

  it('es false si la imagen falló al cargar', () => {
    expect(canZoom({ zoomable: true, kind: 'image', errored: true })).toBe(false)
  })
})
