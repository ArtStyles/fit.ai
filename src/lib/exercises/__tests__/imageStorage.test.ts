import { describe, it, expect } from 'vitest'
import { extensionFromUrl, storageObjectKey } from '../imageStorage'

describe('extensionFromUrl', () => {
  it('extracts a lowercase extension from the path', () => {
    expect(extensionFromUrl('https://raw.githubusercontent.com/x/exercises/A/0.jpg')).toBe('jpg')
    expect(extensionFromUrl('https://x/y.PNG?token=abc')).toBe('png')
  })

  it('defaults to jpg when there is no extension', () => {
    expect(extensionFromUrl('https://x/y/noext')).toBe('jpg')
    expect(extensionFromUrl('not a url')).toBe('jpg')
  })
})

describe('storageObjectKey', () => {
  it('builds {id}.{ext} from a string id', () => {
    expect(storageObjectKey('3_4_Sit-Up', 'https://x/exercises/3_4_Sit-Up/0.jpg')).toBe('3_4_Sit-Up.jpg')
    expect(storageObjectKey('Foo', 'https://x/y/a')).toBe('Foo.jpg')
  })
})
