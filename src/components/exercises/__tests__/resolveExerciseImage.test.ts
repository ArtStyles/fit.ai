import { describe, it, expect } from 'vitest'
import { resolveExerciseImage } from '../resolveExerciseImage'

describe('resolveExerciseImage', () => {
  it('returns the image when src is a non-empty string', () => {
    expect(resolveExerciseImage('https://x/y.png')).toEqual({ kind: 'image', src: 'https://x/y.png' })
  })

  it('trims surrounding whitespace', () => {
    expect(resolveExerciseImage('  https://x/y.png  ')).toEqual({ kind: 'image', src: 'https://x/y.png' })
  })

  it('returns placeholder for null, undefined or blank', () => {
    expect(resolveExerciseImage(null)).toEqual({ kind: 'placeholder' })
    expect(resolveExerciseImage(undefined)).toEqual({ kind: 'placeholder' })
    expect(resolveExerciseImage('')).toEqual({ kind: 'placeholder' })
    expect(resolveExerciseImage('   ')).toEqual({ kind: 'placeholder' })
  })
})
