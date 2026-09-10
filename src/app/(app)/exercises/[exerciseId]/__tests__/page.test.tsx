import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ context: vi.fn() }))
vi.mock('@/lib/auth/server', () => ({ requireAppUserContext: auth.context }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND') } }))
vi.mock('@/components/navigation/PageTopBar', () => ({ PageTopBar: ({ title }: { title: string }) => <h1>{title}</h1> }))
vi.mock('@/components/exercises/ExerciseMotionPreview', () => ({ ExerciseMotionPreview: () => <div>Motion preview</div> }))
vi.mock('@/components/exercises/ExerciseProgressChart', () => ({ ExerciseProgressChart: () => null }))
vi.mock('@/components/evidence/SessionSummaryRow', () => ({
  SessionSummaryRow: ({ href, title }: { href: string; title: string }) => <a href={href}>{title}</a>,
}))

import ExerciseDetailPage from '../page'

const EXERCISE_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_EXERCISE_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_USER_ID = '44444444-4444-4444-8444-444444444444'

function snapshot(exerciseId = EXERCISE_ID) {
  return {
    version: 1,
    workout: { id: '55555555-5555-4555-8555-555555555555', name: 'Sesión conservada', focus: null, dayOfWeek: 1 },
    plan: null,
    exercises: [{ exerciseId, name: 'Historic press', nameEs: 'Press conservado', muscleGroups: ['chest'], muscleGroupsEs: ['pecho'], isCompound: true }],
  }
}

function exercise() {
  return {
    id: EXERCISE_ID, name: 'Public press', name_es: 'Press público', is_public: true,
    description: 'Public description', description_es: 'Descripción publicada', muscle_groups: ['chest'], muscle_groups_es: ['pecho'],
    equipment: [], equipment_es: [], difficulty: 'beginner', exercise_type: 'strength', is_compound: true,
    instructions: null, instructions_es: null, video_url: null, image_url: null, motion_preview_url: null,
  }
}

function log(index = 0, owner = USER_ID, context: unknown = snapshot()) {
  return {
    id: `exercise-log-${String(index).padStart(4, '0')}`, exercise_id: EXERCISE_ID,
    progress_log_id: `session-${index}`, sets_completed: 3, reps_completed: [8, 8, 8], weights_kg: [20, 20, 20], rpe_values: null, notes: null,
    progress_log: {
      id: `session-${index}`, user_id: owner, workout_id: null, completed_at: '2026-09-10T12:00:00.000Z',
      duration_minutes: 30, mood_rating: null, session_context_snapshot: context,
    },
  }
}

type FixtureRow = Record<string, unknown>

// Models the database boundary: removing either owner or exercise filters exposes
// the wrong fixture rows to the real page, so authorization regressions are visible.
function database({ catalog = [], logs = [], rpcExercise = null, logError = false }: {
  catalog?: ReturnType<typeof exercise>[]
  logs?: ReturnType<typeof log>[]
  rpcExercise?: ReturnType<typeof exercise> | null
  logError?: boolean
} = {}) {
  return {
    rpc: async () => ({ data: { exercise: rpcExercise, logs: [], workouts: [] }, error: null }),
    from(table: string) {
      let rows: FixtureRow[] = table === 'exercises' ? catalog : table === 'exercise_logs' ? logs : []
      let range: [number, number] | null = null
      const query = {
        select() { return query },
        eq(key: string, value: unknown) {
          rows = rows.filter(row => key.includes('.')
            ? (row.progress_log as FixtureRow | null)?.[key.split('.')[1]] === value
            : row[key] === value)
          return query
        },
        in() { return query },
        order() { return query },
        range(from: number, to: number) { range = [from, to]; return query },
        async maybeSingle() { return { data: rows[0] ?? null, error: null } },
        then(resolve: (result: { data: FixtureRow[] | null; error: { message: string } | null }) => unknown) {
          const selected = range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, 300)
          return Promise.resolve(table === 'exercise_logs' && logError
            ? { data: null, error: { message: 'History unavailable' } }
            : { data: selected, error: null }).then(resolve)
        },
      }
      return query
    },
  }
}

function useDatabase(options: Parameters<typeof database>[0] = {}) {
  auth.context.mockResolvedValue({ supabase: database(options), user: { id: USER_ID }, profile: { language: 'es', timezone: 'America/Havana' } })
}

async function renderPage() {
  return renderToStaticMarkup(await ExerciseDetailPage({ params: Promise.resolve({ exerciseId: EXERCISE_ID }) }))
}

describe('exercise detail preserved history', () => {
  beforeEach(() => { auth.context.mockReset() })

  it('opens an owned frozen exercise when the public catalog and RPC no longer return it', async () => {
    useDatabase({ logs: [log()] })
    const html = await renderPage()
    expect(html).toContain('Press conservado')
    expect(html).toContain('Información conservada en tu historial')
    expect(html).toContain('href="/history/session-0"')
    expect(html).toContain('id="exercise-history-title"')
    expect(html).not.toContain('Revisar técnica')
    expect(html).not.toContain('Motion preview')
    expect(html).not.toContain('id="tecnica"')
  })

  it('does not expose another account frozen exercise', async () => {
    useDatabase({ logs: [log(0, OTHER_USER_ID)] })
    await expect(renderPage()).rejects.toThrow('NOT_FOUND')
  })

  it('uses only the owned snapshot when the current catalog row is private', async () => {
    useDatabase({ catalog: [{ ...exercise(), is_public: false, name_es: 'Nombre privado actual', description_es: 'Técnica privada actual' }], logs: [log()] })
    const html = await renderPage()
    expect(html).toContain('Press conservado')
    expect(html).not.toContain('Nombre privado actual')
    expect(html).not.toContain('Técnica privada actual')
  })

  it('excludes other account sessions when owned history is present', async () => {
    useDatabase({ logs: [log(0), log(1, OTHER_USER_ID)] })
    const html = await renderPage()
    expect(html).toContain('href="/history/session-0"')
    expect(html).not.toContain('/history/session-1')
  })

  it.each([null, snapshot(OTHER_EXERCISE_ID), { ...snapshot(), version: 99 }])('requires a valid frozen entry matching the requested exercise (%j)', async context => {
    useDatabase({ logs: [log(0, USER_ID, context)] })
    await expect(renderPage()).rejects.toThrow('NOT_FOUND')
  })

  it('does not reuse a matching snapshot from a different exercise log', async () => {
    useDatabase({ logs: [{ ...log(), exercise_id: OTHER_EXERCISE_ID }] })
    await expect(renderPage()).rejects.toThrow('NOT_FOUND')
  })

  it('keeps the public RPC presentation and technique available', async () => {
    useDatabase({ rpcExercise: exercise() })
    const html = await renderPage()
    expect(html).toContain('Press público')
    expect(html).toContain('Descripción publicada')
    expect(html).toContain('Revisar técnica')
    expect(html).not.toContain('Información conservada en tu historial')
  })

  it('keeps the public direct fallback and its owned history available', async () => {
    useDatabase({ catalog: [exercise()], logs: [log()] })
    const html = await renderPage()
    expect(html).toContain('Press público')
    expect(html).toContain('href="/history/session-0"')
    expect(html).not.toContain('Información conservada en tu historial')
  })

  it('loads beyond the first history page before resolving the frozen exercise', async () => {
    useDatabase({ logs: Array.from({ length: 301 }, (_, index) => log(index, USER_ID, index === 300 ? snapshot() : null)) })
    const html = await renderPage()
    expect(html).toContain('Press conservado')
    expect(html.match(/href="\/history\/session-/g)).toHaveLength(301)
    expect(html).toContain('href="/history/session-300"')
  })

  it('propagates a history read failure instead of treating it as absent history', async () => {
    useDatabase({ logError: true })
    await expect(renderPage()).rejects.toThrow('History unavailable')
  })
})
