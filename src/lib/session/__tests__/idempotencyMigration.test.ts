import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/035_session_save_idempotency.sql', import.meta.url),
  'utf8',
)
const databaseTypes = readFileSync(new URL('../../../types/database.ts', import.meta.url), 'utf8')

describe('session save idempotency migration', () => {
  it('adds an existing-row-compatible idempotency key and partial unique index', () => {
    expect(migration).toContain('ADD COLUMN client_session_id UUID')
    expect(migration).toContain('ADD COLUMN session_result_snapshot JSONB')
    expect(migration).toMatch(/UNIQUE INDEX[\s\S]+user_id, client_session_id[\s\S]+client_session_id IS NOT NULL/i)
    expect(migration).not.toMatch(/DELETE FROM|DROP TABLE|TRUNCATE/i)
  })

  it('atomically inserts the progress and exercise rows and deduplicates races', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.save_session_log_atomic')
    expect(migration).toMatch(/INSERT INTO public\.progress_logs[\s\S]+ON CONFLICT \(user_id, client_session_id\)[\s\S]+DO NOTHING/i)
    expect(migration).toMatch(/IF v_inserted THEN[\s\S]+INSERT INTO public\.exercise_logs/i)
    expect(migration).toContain('RETURN QUERY SELECT v_progress_log_id, v_inserted')
    expect(migration).toContain('p_result_snapshot JSONB')
    expect(migration).toMatch(/RETURNS TABLE\([\s\S]+result_snapshot JSONB/i)
    expect(migration).toMatch(/client_session_id,[\s\S]+session_result_snapshot[\s\S]+p_result_snapshot/i)
    expect(migration).not.toMatch(/EXCEPTION\s+WHEN\s+OTHERS/i)
  })

  it('updates generated table and RPC types', () => {
    expect(databaseTypes.match(/client_session_id/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(databaseTypes).toContain('save_session_log_atomic:')
    expect(databaseTypes).toContain('p_client_session_id: string')
    expect(databaseTypes).toContain('p_result_snapshot: Json')
    expect(databaseTypes.match(/session_result_snapshot/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })
})
