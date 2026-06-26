import { describe, it, expect } from 'vitest'
import { postTileKind } from '../profile'

const base = { photo_urls: [] as string[], session_snapshot: null as any, routine_snapshot: null as any }

describe('postTileKind', () => {
  it('foto tiene prioridad', () => {
    expect(postTileKind({ ...base, photo_urls: ['u'], session_snapshot: {} as any })).toBe('photo')
  })
  it('sesión cuando no hay foto', () => {
    expect(postTileKind({ ...base, session_snapshot: {} as any })).toBe('session')
  })
  it('rutina cuando no hay foto ni sesión', () => {
    expect(postTileKind({ ...base, routine_snapshot: {} as any })).toBe('routine')
  })
  it('texto por defecto', () => {
    expect(postTileKind(base)).toBe('text')
  })
})
