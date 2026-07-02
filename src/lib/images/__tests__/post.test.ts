import { describe, it, expect } from 'vitest'
import { calculateSquareCrop, validatePostImage, postStoragePath, MAX_POST_IMAGE_BYTES } from '../post'

describe('validatePostImage', () => {
  it('acepta una imagen válida', () => {
    expect(validatePostImage('image/jpeg', 1024)).toEqual({ ok: true })
  })
  it('rechaza no-imágenes, vacías y demasiado grandes', () => {
    expect(validatePostImage('application/pdf', 1024).ok).toBe(false)
    expect(validatePostImage('image/png', 0).ok).toBe(false)
    expect(validatePostImage('image/png', MAX_POST_IMAGE_BYTES + 1).ok).toBe(false)
  })
})

describe('postStoragePath', () => {
  it('construye {userId}/{postId}/{index}.webp', () => {
    expect(postStoragePath('u1', 'p1', 0)).toBe('u1/p1/0.webp')
    expect(postStoragePath('u1', 'p1', 2)).toBe('u1/p1/2.webp')
  })
})

describe('calculateSquareCrop', () => {
  it('centra una foto horizontal dentro del recorte cuadrado', () => {
    expect(calculateSquareCrop(1600, 900, 320, 1, 0, 0)).toEqual({
      sx: 350,
      sy: 0,
      size: 900,
    })
  })

  it('respeta el desplazamiento y el zoom sin salirse de la imagen', () => {
    const crop = calculateSquareCrop(1200, 1600, 300, 2, 80, -100)
    expect(crop.size).toBe(600)
    expect(crop.sx).toBeGreaterThanOrEqual(0)
    expect(crop.sy).toBeGreaterThanOrEqual(0)
    expect(crop.sx + crop.size).toBeLessThanOrEqual(1200)
    expect(crop.sy + crop.size).toBeLessThanOrEqual(1600)
  })
})
