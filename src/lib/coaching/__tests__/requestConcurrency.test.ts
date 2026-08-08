import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL('../../../../supabase/migrations/042_trainer_relationships.sql', import.meta.url)

describe('acceptance concurrency contract', () => {
  it('keeps trainer acceptance serialization in the database rather than faking a race in unit mocks', async () => {
    const migration = await readFile(migrationUrl, 'utf8')

    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.accept_coaching_request\([\s\S]+?RETURNS TABLE[\s\S]+?relationship_id UUID,[\s\S]+?accepted_request_id UUID,[\s\S]+?cancelled_request_ids UUID\[\]/)
    expect(migration).toMatch(/SELECT request\.client_user_id INTO v_client_user_id[\s\S]+?pg_advisory_xact_lock\(hashtextextended\(v_client_user_id::TEXT, 0\)\)[\s\S]+?FOR UPDATE/)
    expect(migration).toMatch(/INSERT INTO public\.coaching_relationships[\s\S]+?UPDATE public\.coaching_requests[\s\S]+?SET status = 'accepted'[\s\S]+?UPDATE public\.coaching_requests request[\s\S]+?request\.status = 'pending'/)
  })

  it('persists the winning key and cancellation set so retries return the same result without new writes', async () => {
    const migration = await readFile(migrationUrl, 'utf8')

    expect(migration).toMatch(/acceptance_idempotency_key UUID/)
    expect(migration).toMatch(/acceptance_cancelled_request_ids UUID\[\]/)
    expect(migration).toMatch(/v_request\.status = 'accepted'[\s\S]+?v_request\.acceptance_idempotency_key = \$2[\s\S]+?RETURN QUERY SELECT v_relationship\.id, v_request\.id, v_request\.acceptance_cancelled_request_ids/)
  })
})
