import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generatePlanAdjustmentIntent } from '../planAdjustmentIntent'

const context = {
  daysPerWeek: 4,
  sessionDurationMinutes: 60,
  availableEquipment: ['dumbbells', 'bench'],
  cardioPreferences: ['walking' as const],
  exercises: [{ id: 'exercise-1', name: 'Press de banca' }],
}

describe('plan adjustment intent', () => {
  const previousMock = process.env.USE_AI_MOCK
  beforeEach(() => { process.env.USE_AI_MOCK = 'true' })
  afterEach(() => { process.env.USE_AI_MOCK = previousMock })

  it('routes pain and health requests to readiness review', async () => {
    const result = await generatePlanAdjustmentIntent({
      userId: 'user-1',
      request: 'Me duele el hombro, cambia la rutina',
      context,
    })
    expect(result.intent).toEqual({ type: 'health_change' })
  })

  it('creates a typed duration intent', async () => {
    const result = await generatePlanAdjustmentIntent({
      userId: 'user-1',
      request: 'Quiero entrenar 30 minutos',
      context,
    })
    expect(result.intent).toEqual({ type: 'change_duration', sessionDurationMinutes: 30 })
  })

  it('only replaces an exercise that exists in context', async () => {
    const result = await generatePlanAdjustmentIntent({
      userId: 'user-1',
      request: 'Quiero reemplazar press de banca',
      context,
    })
    expect(result.intent).toEqual({ type: 'replace_exercise', exerciseId: 'exercise-1' })
  })
})

