import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { PersonalGoalsPanel, GoalResults } from './PersonalGoalsPanel'
import type { GoalPoint, PersonalExerciseGoal } from './types'

// Mobile tests use the classic JSX runtime; production Vite uses automatic JSX.
vi.stubGlobal('React', React)
const point = (seconds: number, date: string): GoalPoint => ({ sessionId: date, sessionName: 'Training', completedAt: `${date}T12:00:00Z`, date, best: { weightKg: 0, reps: 0, seconds }, sets: [{ weightKg: 0, reps: 0, seconds }] })
const first = point(30, '2026-09-01'), latest = point(40, '2026-09-11'), best = point(45, '2026-09-08')
const goal: PersonalExerciseGoal = { id: 'g', exerciseId: 'e', name: 'Plank', muscleGroups: [], kind: 'duration', target: { kind: 'duration', seconds: 45 }, version: 1, createdAt: '2026-09-01T12:00:00Z', points: [first, best, latest], first, latest, best, achieved: true, achievedAt: best.completedAt }

describe('personal goals presentation', () => {
  it('shows real first/latest/best sets without percentages or accumulated duration', () => {
    const html = renderToStaticMarkup(<GoalResults goal={goal} language="en" />)
    expect(html).toContain('30 s'); expect(html).toContain('40 s'); expect(html).toContain('45 s')
    expect(html).not.toContain('115'); expect(html).not.toContain('%'); expect(html).not.toContain('kg')
  })
  it('names the available-history scope and historical achievement; empty evidence stays empty', () => {
    const html = renderToStaticMarkup(<PersonalGoalsPanel model={{ accountId: 'a', language: 'en', today: '2026-09-11', catalog: [], goals: [goal] }} language="en" sessionVersion={0} selectedExerciseId={null} onSelectionHandled={() => {}} refresh={async () => {}} />)
    expect(html).toContain('All your available history')
    expect(html).toContain('Reached in your records')
    const empty = renderToStaticMarkup(<GoalResults goal={{ ...goal, first: null, latest: null, best: null, points: [], achieved: false }} language="es" />)
    expect(empty).toContain('Aún no hay series registradas')
    expect(empty).not.toContain('0 s')
  })
})
