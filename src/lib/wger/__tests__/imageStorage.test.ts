import { describe, it, expect } from 'vitest'
import { extensionFromUrl, storageObjectKey } from '../imageStorage'

describe('extensionFromUrl', () => {
  it('extracts a lowercase extension from the path', () => {
    expect(extensionFromUrl('https://wger.de/media/exercise-images/91/Bench-press.png')).toBe('png')
    expect(extensionFromUrl('https://wger.de/media/x/y.JPG?token=abc')).toBe('jpg')
  })

  it('defaults to jpg when there is no extension', () => {
    expect(extensionFromUrl('https://wger.de/media/x/noextension')).toBe('jpg')
    expect(extensionFromUrl('not a url')).toBe('jpg')
  })
})

describe('storageObjectKey', () => {
  it('builds {wgerId}.{ext}', () => {
    expect(storageObjectKey(123, 'https://wger.de/media/x/a.png')).toBe('123.png')
    expect(storageObjectKey(7, 'https://wger.de/media/x/a')).toBe('7.jpg')
  })
})
