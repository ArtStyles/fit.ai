import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ClientInsightsDashboard } from '../ClientInsightsDashboard'

const detail = {
  client: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Ada Cliente', avatarUrl: null, timeZone: 'America/Havana' },
  relationshipStartedAt: '2026-07-01T12:00:00.000Z',
  adherence: { prescribed: 4, completed: 1, missed: 1, pending: 2, adherencePercent: 50 },
  occurrences: [
    { id: 'completed', scheduledDate: '2026-08-03', workoutName: 'Fuerza A', status: 'completed' },
    { id: 'missed', scheduledDate: '2026-08-04', workoutName: 'Fuerza B', status: 'missed' },
    { id: 'pending', scheduledDate: '2026-08-05', workoutName: 'Fuerza C', status: 'pending' },
    { id: 'incomplete', scheduledDate: '2026-08-06', workoutName: 'Fuerza D', status: 'incomplete' },
  ],
  alerts: [{ code: 'low_adherence', message: 'La adherencia reciente está por debajo del 50%.' }],
  sessions: [{
    id: 'session-1', completedAt: '2026-08-03T15:00:00.000Z', workoutName: 'Fuerza A', durationMinutes: 45,
    notes: '<script>alert("no ejecutar")</script>', status: 'incomplete',
    exerciseResults: [{ id: 'result-1', name: 'Sentadilla', setsCompleted: 3, repsCompleted: [8, 8, 7], weightsKg: [60, 60, 60], rpeValues: [8, 8, 9], durationSeconds: 180, notes: '<b>Última serie difícil</b>' }],
  }],
} as any

describe('ClientInsightsDashboard', () => {
  it('renders prescribed adherence and evidence as escaped read-only content', () => {
    const html = renderToStaticMarkup(<ClientInsightsDashboard detail={detail} weeks={4} />)

    expect(html).toContain('Ada Cliente')
    expect(html).toContain('completed')
    expect(html).toContain('missed')
    expect(html).toContain('pending')
    expect(html).toContain('incomplete')
    expect(html).toContain('Las sesiones adicionales o personales se excluyen de la adherencia.')
    expect(html).toContain('&lt;script&gt;alert(&quot;no ejecutar&quot;)&lt;/script&gt;')
    expect(html).toContain('&lt;b&gt;Última serie difícil&lt;/b&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toMatch(/<form|<button|<input/i)
  })

  it('offers only accessible four- and twelve-week detail filters', () => {
    const html = renderToStaticMarkup(<ClientInsightsDashboard detail={detail} weeks={4} />)

    expect(html).toContain('aria-label="Periodo de evidencia"')
    expect(html).toContain('href="?weeks=4"')
    expect(html).toContain('href="?weeks=12"')
    expect(html).toContain('4 semanas')
    expect(html).toContain('12 semanas')
    expect(html).not.toContain('8 semanas')
  })
})
