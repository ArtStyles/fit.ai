import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ProgressPerformanceList } from '../ProgressPerformanceList'
import type { ProgressRecord } from '../progressViewModel'

vi.mock('@/components/navigation/PendingLink', () => ({ PendingLink: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }))

const record: ProgressRecord = { exerciseId: 'squat', exerciseName: 'Sentadilla', muscleGroups: [], bestCompletedAt: '2026-09-01T12:00:00Z', bestDate: '2026-09-01', maxWeightKg: 62.5, repsAtMaxWeight: 5, maxReps: 12, totalVolumeKg: 1000, sessionCount: 2 }

describe('ProgressPerformanceList', () => {
  it('merges a recent record and latest point into one exercise while preserving same-set repetitions and decimal weights', () => {
    const html = renderToStaticMarkup(<ProgressPerformanceList locale="es" records={[record]} points={[{ exerciseId: 'squat', exerciseName: 'Sentadilla', date: '2026-09-11', maxWeightKg: 60, repsAtMaxWeight: 10, volumeKg: 600 }]} />)
    expect(html.match(/href="\/exercises\/squat"/g)).toHaveLength(1)
    expect(html).toContain('62,5 kg × 5 reps')
    expect(html).toContain('60 kg × 10 reps')
    expect(html).not.toContain('62,5 kg × 12')
    expect(html).not.toContain('%')
    expect(html).toContain('Mejor en los últimos 12 meses')
  })

  it('uses completion time and session id to choose a deterministic latest result on the same day', () => {
    const points = [
      { exerciseId: 'squat', exerciseName: 'Sentadilla', date: '2026-09-11', completedAt: '2026-09-11T13:00:00Z', sessionId: 'session-a', maxWeightKg: 40, repsAtMaxWeight: 8, volumeKg: 320 },
      { exerciseId: 'squat', exerciseName: 'Sentadilla', date: '2026-09-11', completedAt: '2026-09-11T18:00:00Z', sessionId: 'session-b', maxWeightKg: 55, repsAtMaxWeight: 5, volumeKg: 275 },
    ]
    const html = renderToStaticMarkup(<ProgressPerformanceList locale="es" records={[]} points={points} />)
    expect(html).toContain('55 kg × 5 reps')
    expect(html).not.toContain('40 kg × 8 reps')

    const exactTie = renderToStaticMarkup(<ProgressPerformanceList locale="es" records={[]} points={[
      { ...points[1], sessionId: 'session-b', maxWeightKg: 55 },
      { ...points[1], sessionId: 'session-c', maxWeightKg: 60 },
    ]} />)
    expect(exactTie).toContain('60 kg × 5 reps')
    expect(exactTie).not.toContain('55 kg × 5 reps')
  })

  it('shows a first point without inventing a record or comparison', () => {
    const html = renderToStaticMarkup(<ProgressPerformanceList locale="en" records={[]} points={[{ exerciseId: 'pushup', exerciseName: 'Push-up', date: '2026-09-11', maxWeightKg: 0, repsAtMaxWeight: 10, volumeKg: 0 }]} />)
    expect(html).toContain('10 reps')
    expect(html).not.toContain('0 kg')
    expect(html).not.toContain('Best in the last 12 months')
    expect(html).not.toContain('%')
  })

  it('explains missing set evidence without invented values', () => {
    const html = renderToStaticMarkup(<ProgressPerformanceList locale="es" records={[]} points={[]} />)
    expect(html).toContain('Guarda series con carga y repeticiones')
    expect(html).not.toContain(' kg')
  })
})
