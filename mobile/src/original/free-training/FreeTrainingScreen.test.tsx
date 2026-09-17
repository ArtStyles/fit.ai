import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { FreeTrainingModel } from './types'

vi.mock('./data', () => ({ clearFreeTrainingDraft: vi.fn(), saveFreeTraining: vi.fn(), saveFreeTrainingDraft: vi.fn() }))
vi.mock('../router', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>, navigate: vi.fn() }))
vi.mock('@/components/navigation/PageTopBar', () => ({ PageTopBar: ({ title }: { title: string }) => <h1>{title}</h1> }))
vi.mock('@/components/plan/ExercisePicker', () => ({ ExerciseCatalogDialog: () => null }))

import { FreeTrainingScreen } from './FreeTrainingScreen'

function model(language: 'es' | 'en' = 'es'): FreeTrainingModel {
  return {
    accountId: 'owner', language, timeZone: 'UTC', today: '2026-09-17', hasActivePlan: false, weeklyGoal: 3,
    catalog: [{ id: 'press', name: 'Press', muscleGroups: [], timed: false, previous: null, previousDate: null }],
    initial: { accountId: 'owner', sessionId: 'session', operationId: 'operation', expectedVersion: null, date: '2026-09-17', name: '', durationMinutes: null, notes: '', detailLevel: 'attendance', exercises: [] },
    recent: [{ id: 'earlier', name: 'Anterior', date: '2026-09-16', detailLevel: 'attendance' }],
  }
}

describe('free training form organization', () => {
  it('keeps an empty exercise section visible while secondary preferences and older entries stay collapsed', () => {
    const html = renderToStaticMarkup(<FreeTrainingScreen model={model()} draft={null} />)
    expect(html).toContain('Datos de la sesión')
    expect(html).toContain('Ejercicios y series')
    expect(html).toContain('Puedes guardar solo la constancia o añadir los ejercicios que hiciste.')
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>.*?Añadir ejercicios/s)
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>.*?Meta semanal/s)
    expect(html).toMatch(/<details[^>]*>\s*<summary[^>]*>.*?Completar un registro anterior/s)
    expect(html).not.toContain('<details open')
    expect(html).not.toContain('type="search"')
    expect(html).toContain('Guardar constancia')
  })

  it('keeps logged fields visible with a clear partial state when editing the same session', () => {
    const value = model()
    value.initial = { ...value.initial, expectedVersion: 2, detailLevel: 'partial', exercises: [{ exerciseId: 'press', sets: [{ weightKg: 30, reps: 8 }] }] }
    const html = renderToStaticMarkup(<FreeTrainingScreen model={value} draft={null} />)
    expect(html).toContain('Editar entrenamiento')
    expect(html).toContain('Detalle parcial')
    expect(html).toContain('Press, serie 1, reps')
    expect(html).toContain('value="8"')
    expect(html).toMatch(/aria-label="Ocultar series · Press"[^>]*aria-expanded="true"/)
    expect(html).toContain('1 serie')
    expect(html).toContain('Guardar cambios')
    expect(html).not.toContain('Ocultar ejercicios')
    expect(html).not.toContain('type="search"')
  })

  it('localizes the reorganized screen without exposing weekly preferences for an active plan', () => {
    const value = { ...model('en'), hasActivePlan: true }
    const html = renderToStaticMarkup(<FreeTrainingScreen model={value} draft={null} />)
    expect(html).toContain('Session details')
    expect(html).toContain('Exercises and sets')
    expect(html).toContain('Save attendance')
    expect(html).toContain('Complete an earlier entry')
    expect(html).not.toContain('Workout goal per week')
  })
})
