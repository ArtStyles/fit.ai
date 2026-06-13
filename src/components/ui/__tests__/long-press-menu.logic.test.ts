import { describe, it, expect } from 'vitest'
import { computeMenuPosition, movedBeyondTolerance } from '../long-press-menu.logic'

const trigger = { top: 100, left: 50, width: 200, height: 60 }
const viewport = { viewportWidth: 390, viewportHeight: 800 }

describe('computeMenuPosition', () => {
  it('coloca el menú debajo cuando cabe', () => {
    const r = computeMenuPosition({ trigger, menuWidth: 220, menuHeight: 160, ...viewport })
    expect(r.placement).toBe('below')
    expect(r.top).toBe(100 + 60 + 10) // top + height + gap
  })

  it('voltea encima cuando no cabe debajo', () => {
    const low = { top: 720, left: 50, width: 200, height: 60 }
    const r = computeMenuPosition({ trigger: low, menuWidth: 220, menuHeight: 160, ...viewport })
    expect(r.placement).toBe('above')
    expect(r.top).toBe(720 - 10 - 160) // top - gap - menuHeight
  })

  it('centra horizontalmente sobre el disparador', () => {
    const r = computeMenuPosition({ trigger, menuWidth: 100, menuHeight: 120, ...viewport })
    expect(r.left).toBe(50 + 200 / 2 - 100 / 2) // 100
  })

  it('hace clamp a la izquierda cuando el disparador está pegado al borde', () => {
    const edge = { top: 100, left: 0, width: 40, height: 40 }
    const r = computeMenuPosition({ trigger: edge, menuWidth: 220, menuHeight: 120, ...viewport })
    expect(r.left).toBe(8) // margin
  })

  it('hace clamp a la derecha cuando se sale por el borde derecho', () => {
    const edge = { top: 100, left: 360, width: 40, height: 40 }
    const r = computeMenuPosition({ trigger: edge, menuWidth: 220, menuHeight: 120, ...viewport })
    expect(r.left).toBe(390 - 220 - 8) // viewportWidth - menuWidth - margin
  })

  it('nunca coloca el menú por encima del margen superior', () => {
    const top = { top: 5, left: 50, width: 200, height: 30 }
    const r = computeMenuPosition({ trigger: top, menuWidth: 220, menuHeight: 700, ...viewport })
    expect(r.top).toBeGreaterThanOrEqual(8)
  })
})

describe('movedBeyondTolerance', () => {
  it('es false dentro de la tolerancia', () => {
    expect(movedBeyondTolerance({ x: 0, y: 0 }, { x: 5, y: 5 }, 10)).toBe(false)
  })
  it('es true al superar la tolerancia en X', () => {
    expect(movedBeyondTolerance({ x: 0, y: 0 }, { x: 15, y: 0 }, 10)).toBe(true)
  })
  it('es true al superar la tolerancia en Y', () => {
    expect(movedBeyondTolerance({ x: 0, y: 0 }, { x: 0, y: 12 }, 10)).toBe(true)
  })
})
