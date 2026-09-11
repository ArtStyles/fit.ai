import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/components/navigation/PendingLink', () => ({ PendingLink: ({ children, ...props }: any) => <a {...props}>{children}</a> }))
import { MuscleActivityDetails } from './MuscleActivityDetails'

const current = { sets: 12, exercises: [
  { key: 'press', exerciseId: 'press', exerciseName: 'Press de banca', sets: 6, sessions: [{ sessionId: 's1', sessionName: 'Torso', date: '2026-09-08', sets: 6 }] },
  { key: 'pushup', exerciseId: 'pushup', exerciseName: 'Flexiones', sets: 6, sessions: [{ sessionId: 's2', sessionName: 'Fuerza', date: '2026-09-09', sets: 6 }] },
] }
const props = { current, previous: { sets: 9, exercises: [] }, range: { from: '2026-09-04', to: '2026-09-10' }, previousRange: { from: '2026-08-28', to: '2026-09-03' }, hasPreviousRecords: true, muscleName: 'Pecho', language: 'es' as const }

describe('muscle activity details', () => {
  it('offers goal navigation only for identified exercises when enabled', () => {
    const html = renderToStaticMarkup(<MuscleActivityDetails {...props} onExerciseSelect={() => {}} />)
    expect(html.match(/aria-label="Seguir mi progreso en/g)).toHaveLength(2)
    expect(html).toContain('aria-label="Seguir mi progreso en Press de banca"')
    expect(renderToStaticMarkup(<MuscleActivityDetails {...props} />)).not.toContain('Seguir mi progreso')
    const unknown = { sets: 2, exercises: [{ key: 'unknown', exerciseId: null, exerciseName: 'Conservado', sets: 2, sessions: [] }] }
    expect(renderToStaticMarkup(<MuscleActivityDetails {...props} current={unknown} onExerciseSelect={() => {}} />)).not.toContain('Seguir mi progreso')
  })

  it('explains the current and previous periods with traceable exercise and session links', () => {
    const html = renderToStaticMarkup(<MuscleActivityDetails {...props} />)
    expect(html).toContain('12')
    expect(html).toContain('9')
    expect(html).toContain('+3 series')
    expect(html).toContain('Press de banca')
    expect(html).toContain('/exercises/press#exercise-history-title')
    expect(html).toContain('/history/s1')
    expect(html).toContain('Torso')
    expect(html).toContain('Ejercicios que aportaron series')
  })
  it('does not invent a comparison when no previous session exists', () => {
    const html = renderToStaticMarkup(<MuscleActivityDetails {...props} hasPreviousRecords={false} previous={{ sets: 0, exercises: [] }} />)
    expect(html).toContain('Sin registros en el periodo anterior para comparar.')
    expect(html).not.toContain('+12 series')
    expect(html).not.toContain('Infinity')
  })
  it('retains zero for an untrained muscle when other previous sessions are recorded', () => {
    const html = renderToStaticMarkup(<MuscleActivityDetails {...props} previous={{ sets: 0, exercises: [] }} />)
    expect(html).toContain('+12 series')
    expect(html).not.toContain('Sin registros en el periodo anterior para comparar.')
  })
  it('keeps unknown exercises readable without constructing a missing ID link', () => {
    const unknown = { sets: 2, exercises: [{ key: 'unknown', exerciseId: null, exerciseName: 'Ejercicio conservado', sets: 2, sessions: [{ sessionId: 's1', sessionName: 'Torso', date: '2026-09-08', sets: 2 }] }] }
    const html = renderToStaticMarkup(<MuscleActivityDetails {...props} current={unknown} />)
    expect(html).toContain('Ejercicio conservado')
    expect(html).not.toContain('/exercises/')
    expect(html).toContain('/history/s1')
  })
  it('shows an empty current period while retaining the prior total', () => {
    const html = renderToStaticMarkup(<MuscleActivityDetails {...props} current={{ sets: 0, exercises: [] }} />)
    expect(html).toContain('No hay series de este músculo en el periodo elegido.')
    expect(html).toContain('−9 series')
  })
})
