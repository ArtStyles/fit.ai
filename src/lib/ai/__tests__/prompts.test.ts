import { describe, expect, it } from 'vitest'
import { PLAN_SYSTEM_PROMPT, buildContextContent } from '../prompts/system'
import {
  ADJUSTMENT_SYSTEM_PROMPT,
  COACH_CHAT_SYSTEM_PROMPT,
  buildAdjustmentUserMessage,
} from '../prompts/coach'
import type { AdjustmentContext } from '../adjustments'

describe('prompts del generador de planes', () => {
  it('incluye reglas de periodización en el system prompt', () => {
    expect(PLAN_SYSTEM_PROMPT).toContain('PERIODIZACIÓN')
    expect(PLAN_SYSTEM_PROMPT.toLowerCase()).toContain('descarga')
  })

  it('añade el contexto de la semana cuando se proporciona', () => {
    const text = buildContextContent('{}', 'Semana 4: SEMANA DE DESCARGA.')

    expect(text).toContain('CONTEXTO DE LA SEMANA')
    expect(text).toContain('Semana 4: SEMANA DE DESCARGA.')
  })

  it('omite la sección semanal cuando no hay contexto', () => {
    expect(buildContextContent('{}')).not.toContain('CONTEXTO DE LA SEMANA')
  })
})

describe('prompts del coach', () => {
  it('el chat responde en español y sin consejo médico', () => {
    expect(COACH_CHAT_SYSTEM_PROMPT).toContain('español')
    expect(COACH_CHAT_SYSTEM_PROMPT.toLowerCase()).toContain('médico')
  })

  it('el prompt de ajustes define el schema de cambios estructurados', () => {
    expect(ADJUSTMENT_SYSTEM_PROMPT).toContain('update_exercise')
    expect(ADJUSTMENT_SYSTEM_PROMPT).toContain('remove_exercise')
    expect(ADJUSTMENT_SYSTEM_PROMPT).toContain('workoutExerciseId')
    expect(ADJUSTMENT_SYSTEM_PROMPT).toContain('"suggestion"')
  })

  it('el mensaje de ajuste incluye el entrenamiento y la petición', () => {
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
