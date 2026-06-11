import { describe, expect, it } from 'vitest'
import { PLAN_SYSTEM_PROMPT, buildContextContent } from '../prompts/system'

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
