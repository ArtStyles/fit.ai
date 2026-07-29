import { describe, expect, it } from 'vitest'
import { isHealthChangeRequest } from '../healthRequest'

describe('isHealthChangeRequest', () => {
  it.each([
    'Me duele el hombro',
    'Tengo una lesión en la rodilla',
    'I have pain in my back',
  ])('detects a health-related request: %s', request => {
    expect(isHealthChangeRequest(request)).toBe(true)
  })

  it('does not confuse pecho with a health request', () => {
    expect(isHealthChangeRequest('Quiero entrenar más el pecho')).toBe(false)
  })
})
