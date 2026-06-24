import { describe, it, expect } from 'vitest'
import { validatePostImage, postStoragePath, MAX_POST_IMAGE_BYTES } from '../post'

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
