import { describe, expect, it } from 'vitest'
import {
  ADJUSTMENT_SYSTEM_PROMPT,
  COACH_CHAT_SYSTEM_PROMPT,
  buildAdjustmentUserMessage,
} from '../prompts/coach'
import type { AdjustmentContext } from '../adjustments'

describe('prompts del coach', () => {
  it('el chat responde en español y sin consejo médico', () => {
    expect(COACH_CHAT_SYSTEM_PROMPT).toContain('español')
    expect(COACH_CHAT_SYSTEM_PROMPT.toLowerCase()).toContain('médico')
  })

  it('el prompt de ajustes define cambios estructurados', () => {
    expect(ADJUSTMENT_SYSTEM_PROMPT).toContain('update_exercise')
    expect(ADJUSTMENT_SYSTEM_PROMPT).toContain('remove_exercise')
    expect(ADJUSTMENT_SYSTEM_PROMPT).toContain('workoutExerciseId')
    expect(ADJUSTMENT_SYSTEM_PROMPT).toContain('"suggestion"')
  })

  it('el mensaje incluye el entrenamiento y la petición', () => {
    const context: AdjustmentContext = {
      workoutName: 'Push — Pecho',
      workoutFocus: 'Pecho',
      exercises: [
        { workoutExerciseId: 'we-1', name: 'Press Banca', sets: 3, reps: 8, targetRpe: 7 },
      ],
    }

    const message = buildAdjustmentUserMessage(context, 'Quiero más intensidad', 'contexto del usuario')
    expect(message).toContain('Push — Pecho')
    expect(message).toContain('we-1')
    expect(message).toContain('Quiero más intensidad')
    expect(message).toContain('contexto del usuario')
  })
})
