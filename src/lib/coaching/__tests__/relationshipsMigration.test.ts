import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readArtifact(url: URL): string {
  try {
    return readFileSync(url, 'utf8')
  } catch {
    return ''
  }
}

const migration = readArtifact(
  new URL('../../../../supabase/migrations/042_trainer_relationships.sql', import.meta.url),
)
const databaseTypes = readArtifact(new URL('../../../types/database.ts', import.meta.url))

const relationshipTables = [
  'trainer_service_offerings',
  'coaching_requests',
  'coaching_relationships',
  'coaching_consents',
]

describe('trainer relationships migration', () => {
  it('creates the service, request, relationship, and scoped consent records under RLS', () => {
    for (const table of relationshipTables) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?public\\.${table}`, 'i'))
      expect(migration).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
      expect(databaseTypes).toContain(`${table}: {`)
    }
  })

  it('enforces the active relationship and pending duplicate invariants in the database', () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX coaching_relationships_one_active_client\s+ON public\.coaching_relationships\(client_user_id\)\s+WHERE status = 'active';/i,
    )
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX coaching_requests_one_pending_equivalent\s+ON public\.coaching_requests\s*\(client_user_id, trainer_user_id, service_id\)\s+WHERE status = 'pending';/i,
    )
    expect(migration).toMatch(/CONSTRAINT coaching_relationships_client_trainer_distinct CHECK \(client_user_id <> trainer_user_id\)/i)
    expect(migration).toMatch(/CONSTRAINT coaching_requests_client_trainer_distinct CHECK \(client_user_id <> trainer_user_id\)/i)
  })

  it('rejects pending requests while the client already has an active relationship', () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.require_no_active_coaching_relationship_for_pending_request\(\)[\s\S]+NEW\.status = 'pending'[\s\S]+FROM public\.coaching_relationships relationship[\s\S]+relationship\.client_user_id = NEW\.client_user_id[\s\S]+relationship\.status = 'active'/i,
    )
    expect(migration).toMatch(
      /CREATE TRIGGER trg_coaching_requests_no_active_relationship\s+BEFORE INSERT OR UPDATE OF client_user_id, status ON public\.coaching_requests/i,
    )
  })

  it('keeps commercial values null for the free preview service model', () => {
    expect(migration).toMatch(/billing_mode TEXT NOT NULL DEFAULT 'free_preview'/i)
    expect(migration).toMatch(/price_minor INTEGER/i)
    expect(migration).toMatch(/currency TEXT/i)
    expect(migration).toMatch(/billing_interval TEXT/i)
    expect(migration).toMatch(
      /CHECK\s*\(\s*billing_mode <> 'free_preview' OR \(\s*price_minor IS NULL AND currency IS NULL AND billing_interval IS NULL\s*\)\s*\)/i,
    )
  })

  it('records one revocable consent per relationship scope', () => {
    expect(migration).toMatch(/scope TEXT NOT NULL CHECK \(scope IN \('training_profile', 'body_measurements'\)\)/i)
    expect(migration).toMatch(/text_version TEXT NOT NULL/i)
    expect(migration).toMatch(/granted_at TIMESTAMPTZ NOT NULL/i)
    expect(migration).toMatch(/revoked_at TIMESTAMPTZ/i)
    expect(migration).toMatch(/granted_by UUID NOT NULL/i)
    expect(migration).toMatch(/revoked_by UUID/i)
    expect(migration).toMatch(/UNIQUE \(relationship_id, scope\)/i)
  })

  it('exposes the scope helper only to its authenticated trainer and otherwise denies access', () => {
    const helper = migration.match(
      /CREATE OR REPLACE FUNCTION public\.has_active_coaching_scope\(\s*p_trainer_id UUID,\s*p_client_id UUID,\s*p_scope TEXT\s*\)[\s\S]+?GRANT EXECUTE ON FUNCTION public\.has_active_coaching_scope\(UUID, UUID, TEXT\) TO authenticated;/i,
    )?.[0]

    expect(helper).toBeDefined()
    expect(helper).toMatch(/RETURNS BOOLEAN/i)
    expect(helper).toMatch(/SECURITY DEFINER/i)
    expect(helper).toMatch(/SET search_path = public, pg_temp/i)
    expect(helper).toMatch(/auth\.uid\(\) IS NOT NULL\s+AND auth\.uid\(\) = p_trainer_id/i)
    expect(helper).toMatch(/trainer_profile\.status = 'active'/i)
    expect(helper).toMatch(/relationship\.status = 'active'/i)
    expect(helper).toMatch(/training_consent\.scope = 'training_profile'[\s\S]+training_consent\.revoked_at IS NULL/i)
    expect(helper).toMatch(/consent\.scope = p_scope[\s\S]+consent\.revoked_at IS NULL/i)
    expect(helper).toMatch(/REVOKE ALL ON FUNCTION public\.has_active_coaching_scope\(UUID, UUID, TEXT\) FROM PUBLIC, anon, authenticated, service_role/i)
    expect(helper).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.has_active_coaching_scope\(UUID, UUID, TEXT\) TO anon/i)
  })

  it('does not grant professional access from social follows or progress tables', () => {
    expect(migration).not.toMatch(/\bfollows\b/i)
    expect(migration).not.toMatch(/\bworkout_plans\b|\bprogress_logs\b|\bexercise_logs\b/i)
  })

  it('uses RLS and minimum grants instead of direct participant mutations', () => {
    for (const table of relationshipTables) {
      expect(migration).toMatch(
        new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, 'i'),
      )
    }

    expect(migration).toMatch(/trainer_service_offerings: manage own active profile[\s\S]+trainer_profile\.user_id = auth\.uid\(\)[\s\S]+trainer_profile\.status = 'active'/i)
    expect(migration).toMatch(/coaching_requests: read participant[\s\S]+auth\.uid\(\) = client_user_id OR auth\.uid\(\) = trainer_user_id/i)
    expect(migration).toMatch(/coaching_relationships: read participant[\s\S]+auth\.uid\(\) = client_user_id OR auth\.uid\(\) = trainer_user_id/i)
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.coaching_requests TO authenticated/i)
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.coaching_relationships TO authenticated/i)
    expect(migration).toMatch(/GRANT SELECT ON TABLE public\.coaching_consents TO authenticated/i)
    expect(migration).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE public\.coaching_(?:requests|relationships|consents) TO authenticated/i)
  })
})
