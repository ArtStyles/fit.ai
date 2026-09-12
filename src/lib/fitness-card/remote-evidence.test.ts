import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { loadConnectedFitnessEvidence } from './remote-evidence'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const exerciseId = '11111111-1111-4111-8111-111111111111'

type Row = Record<string, unknown>

function clientFixture(input: {
  tables: Record<string, Row[]>
  snapshot?: unknown
  errors?: Partial<Record<string, string>>
}) {
  const query = (table: string) => {
    let rows = [...(input.tables[table] ?? [])]
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return builder },
      order: () => builder,
      range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: input.errors?.[table] ? { message: input.errors[table] } : null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: input.errors?.[table] ? { message: input.errors[table] } : null }),
    }
    return builder
  }
  return {
    from: (table: string) => query(table),
    rpc: async (name: string) => ({
      data: name === 'original_app_snapshot_read_v1' && input.snapshot !== undefined ? [{ revision: 'snapshot-revision', payload: input.snapshot }] : [],
      error: input.errors?.snapshot ? { message: input.errors.snapshot } : null,
    }),
  } as unknown as SupabaseClient
}

function snapshot(tables: Record<string, Row[]>, accountId = owner) {
  return { version: 1, accountId, remoteUserId: accountId, email: 'owner@example.test', revision: 2, remoteRevision: null, lastSyncedRevision: 0, tables }
}

describe('loadConnectedFitnessEvidence', () => {
  it('keeps a locally deleted baseline row deleted while adding a new canonical session', async () => {
    const log = { id: 'deleted', user_id: owner, completed_at: '2026-09-10T12:00:00Z' }
    const added = { id: 'added', user_id: owner, completed_at: '2026-09-11T12:00:00Z' }
    const client = clientFixture({ tables: { profiles: [{ id: owner, timezone: 'UTC' }], progress_logs: [log, added] }, snapshot: snapshot({ progress_logs: [log] }) })
    const result = await loadConnectedFitnessEvidence(client, owner, new Date('2026-09-12T12:00:00Z'), { accountId: owner, remoteUserId: owner, remoteRevision: 'snapshot-revision', tables: { profiles: [{ id: owner, timezone: 'UTC' }], progress_logs: [], exercise_logs: [], mobile_web_base: [{ id: 'canonical', tables: { progress_logs: [log] } }] } })
    expect(result.totalSessions).toBe(1)
  })

  it('fails closed when the remote backup changed after the local state was synchronized', async () => {
    const client = clientFixture({ tables: { profiles: [{ id: owner }], progress_logs: [] }, snapshot: snapshot({}) })
    await expect(loadConnectedFitnessEvidence(client, owner, undefined, {
      accountId: owner, remoteUserId: owner, remoteRevision: 'older-revision', tables: {},
    })).rejects.toThrow('FITNESS_CARD_NEEDS_SYNC')
  })

  it.each(['canonical', 'duplicate'])('prefers canonical corrections over snapshot %s and omits deleted web-origin rows while preserving mobile sessions', async snapshotId => {
    const log = { id: 'canonical', client_session_id: owner, user_id: owner, completed_at: '2026-09-10T12:00:00Z' }
    const deleted = { ...log, id: 'deleted', client_session_id: 'deleted-session' }
    const mobile = { ...log, id: 'mobile', client_session_id: 'mobile-session' }
    const detail = { id: 'detail', progress_log_id: log.id, exercise_id: exerciseId, sets_completed: 1, weights_kg: [40], reps_completed: [8] }
    const client = clientFixture({ tables: { profiles: [{ id: owner, timezone: 'UTC' }], progress_logs: [log], exercise_logs: [detail], exercises: [{ id: exerciseId, name: 'Press', muscle_groups: ['chest'] }] }, snapshot: snapshot({
      progress_logs: [{ ...log, id: snapshotId }, deleted, mobile],
      exercise_logs: [{ ...detail, progress_log_id: snapshotId, weights_kg: [100] }, { ...detail, id: 'deleted-detail', progress_log_id: deleted.id, weights_kg: [120] }],
      mobile_web_base: [{ id: 'canonical', tables: { progress_logs: [log, deleted] } }],
    }) })
    const result = await loadConnectedFitnessEvidence(client, owner, new Date('2026-09-12T12:00:00Z'))
    expect(result.totalSessions).toBe(2)
    expect(result.records[0]?.weightKg).toBe(40)
  })
  it('merges canonical additions and corrections while preserving locally edited sets', async () => {
    const oldLogs = Array.from({ length: 300 }, (_, index) => ({ id: `old-${index}`, user_id: owner, completed_at: '2025-01-01T12:00:00.000Z' }))
    const canonicalLog = { id: 'shared', user_id: owner, completed_at: '2026-09-10T12:00:00.000Z' }
    const client = clientFixture({
      tables: {
        profiles: [{ id: owner, language: 'en', timezone: 'UTC' }],
        progress_logs: [...oldLogs, canonicalLog],
        exercise_logs: [{ id: 'snapshot-detail', progress_log_id: 'shared', exercise_id: exerciseId, sets_completed: 1, weights_kg: [40], reps_completed: [8] }],
        exercises: [{ id: exerciseId, name: 'Live press', muscle_groups: ['back'] }],
      },
      snapshot: snapshot({
        progress_logs: [{ ...canonicalLog, session_context_snapshot: null }],
        exercise_logs: [{ id: 'snapshot-detail', progress_log_id: 'shared', exercise_id: exerciseId, sets_completed: 1, weights_kg: [50], reps_completed: [6] }],
        exercises: [{ id: exerciseId, name: 'Snapshot press', muscle_groups: ['chest'] }],
      }),
    })
    const local = {
      accountId: owner, remoteUserId: owner, remoteRevision: 'snapshot-revision',
      tables: {
        progress_logs: [{ ...canonicalLog, mobile_session_kind: 'free', mobile_free_training: { detailLevel: 'complete' } }],
        exercise_logs: [{ id: 'snapshot-detail', progress_log_id: 'shared', exercise_id: exerciseId, sets_completed: 1, weights_kg: [60], reps_completed: [5] }],
        exercises: [{ id: exerciseId, name: 'Local press', muscle_groups: ['chest'] }],
        mobile_web_base: [{ id: 'canonical', tables: {
          progress_logs: [{ ...canonicalLog, session_context_snapshot: null }],
          exercise_logs: [{ id: 'snapshot-detail', progress_log_id: 'shared', exercise_id: exerciseId, sets_completed: 1, weights_kg: [50], reps_completed: [6] }],
          exercises: [{ id: exerciseId, name: 'Snapshot press', muscle_groups: ['chest'] }],
        } }],
      },
    }

    const result = await loadConnectedFitnessEvidence(client, owner, new Date('2026-09-12T12:00:00.000Z'), local)

    expect(result.records[0]).toMatchObject({ name: 'Local press', weightKg: 60, reps: 5 })
    expect(result.totalSessions).toBe(1)
  })

  it('keeps one complete local exercise result when concurrent edits affect different performance fields', async () => {
    const log = { id: 'shared', user_id: owner, completed_at: '2026-09-10T12:00:00Z' }
    const before = { id: 'detail', progress_log_id: 'shared', exercise_id: exerciseId, sets_completed: 1, weights_kg: [40], reps_completed: [8] }
    const client = clientFixture({ tables: { profiles: [{ id: owner, timezone: 'UTC' }], progress_logs: [log], exercise_logs: [{ ...before, reps_completed: [12] }], exercises: [{ id: exerciseId, name: 'Press', muscle_groups: ['chest'] }] }, snapshot: snapshot({}) })
    const result = await loadConnectedFitnessEvidence(client, owner, new Date('2026-09-12T12:00:00Z'), {
      accountId: owner, remoteUserId: owner, remoteRevision: 'snapshot-revision', tables: {
        profiles: [{ id: owner, timezone: 'UTC' }], progress_logs: [log], exercise_logs: [{ ...before, weights_kg: [50] }],
        exercises: [{ id: exerciseId, name: 'Press', muscle_groups: ['chest'] }],
        mobile_web_base: [{ id: 'canonical', tables: { progress_logs: [log], exercise_logs: [before] } }],
      },
    })
    expect(result.records[0]).toMatchObject({ weightKg: 50, reps: 8 })
  })

  it('applies canonical field corrections when local kept the baseline value', async () => {
    const log = { id: 'shared', user_id: owner, completed_at: '2026-09-10T12:00:00Z' }
    const before = { id: 'detail', progress_log_id: 'shared', exercise_id: exerciseId, sets_completed: 1, weights_kg: [40], reps_completed: [8] }
    const corrected = { ...before, weights_kg: [45] }
    const client = clientFixture({ tables: { profiles: [{ id: owner, timezone: 'UTC' }], progress_logs: [log], exercise_logs: [corrected], exercises: [{ id: exerciseId, name: 'Press', muscle_groups: ['chest'] }] }, snapshot: snapshot({}) })
    const result = await loadConnectedFitnessEvidence(client, owner, new Date('2026-09-12T12:00:00Z'), {
      accountId: owner, remoteUserId: owner, remoteRevision: 'snapshot-revision', tables: {
        profiles: [{ id: owner, timezone: 'UTC' }], progress_logs: [log], exercise_logs: [before], exercises: [{ id: exerciseId, name: 'Press', muscle_groups: ['chest'] }],
        mobile_web_base: [{ id: 'canonical', tables: { progress_logs: [log], exercise_logs: [before], exercises: [{ id: exerciseId, name: 'Press', muscle_groups: ['chest'] }] } }],
      },
    })
    expect(result.records[0]?.weightKg).toBe(45)
  })

  it('refuses a snapshot or local state belonging to another account', async () => {
    const client = clientFixture({
      tables: { profiles: [{ id: owner, language: 'es', timezone: 'UTC' }], progress_logs: [], exercise_logs: [], exercises: [] },
      snapshot: snapshot({}, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    })

    await expect(loadConnectedFitnessEvidence(client, owner)).rejects.toThrow(/snapshot.*account/i)
    await expect(loadConnectedFitnessEvidence(clientFixture({ tables: { profiles: [{ id: owner }], progress_logs: [], exercise_logs: [], exercises: [] }, snapshot: snapshot({}) }), owner, undefined, {
      accountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', remoteUserId: owner, remoteRevision: 'snapshot-revision', tables: {},
    })).rejects.toThrow(/local.*account/i)
  })

  it('fails instead of projecting partial canonical history or a missing backup read', async () => {
    const base = { profiles: [{ id: owner }], progress_logs: [], exercise_logs: [], exercises: [] }
    await expect(loadConnectedFitnessEvidence(clientFixture({ tables: base, snapshot: snapshot({}), errors: { progress_logs: 'history unavailable' } }), owner)).rejects.toThrow('history unavailable')
    await expect(loadConnectedFitnessEvidence(clientFixture({ tables: base, errors: { snapshot: 'backup unavailable' } }), owner)).rejects.toThrow('backup unavailable')
  })
})
