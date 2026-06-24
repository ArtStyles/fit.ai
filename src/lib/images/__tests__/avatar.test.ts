import { describe, it, expect } from 'vitest'
import {
  validateAvatarFile,
  computeSquareCrop,
  avatarStoragePath,
  MAX_AVATAR_BYTES,
} from '../avatar'

describe('validateAvatarFile', () => {
  it('acepta una imagen dentro del límite', () => {
    expect(validateAvatarFile('image/webp', 1024)).toEqual({ ok: true })
    expect(validateAvatarFile('image/jpeg', MAX_AVATAR_BYTES)).toEqual({ ok: true })
  })
  it('rechaza tipos que no son imagen', () => {
    expect(validateAvatarFile('application/pdf', 1024).ok).toBe(false)
  })
  it('rechaza archivos vacíos o demasiado grandes', () => {
    expect(validateAvatarFile('image/png', 0).ok).toBe(false)
    expect(validateAvatarFile('image/png', MAX_AVATAR_BYTES + 1).ok).toBe(false)
  })
})

describe('computeSquareCrop', () => {
  it('no recorta cuando ya es cuadrada', () => {
    expect(computeSquareCrop(500, 500)).toEqual({ sx: 0, sy: 0, size: 500 })
  })
  it('recorta los lados en imágenes apaisadas', () => {
    expect(computeSquareCrop(800, 600)).toEqual({ sx: 100, sy: 0, size: 600 })
  })
  it('recorta arriba/abajo en imágenes verticales', () => {
    expect(computeSquareCrop(600, 800)).toEqual({ sx: 0, sy: 100, size: 600 })
  })
})

describe('avatarStoragePath', () => {
  it('construye {userId}/avatar.webp', () => {
    expect(avatarStoragePath('abc-123')).toBe('abc-123/avatar.webp')
  })
})
