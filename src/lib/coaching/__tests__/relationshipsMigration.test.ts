import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Database } from '../../../types/database'

function readArtifact(url: URL): string {
  try {
    return readFileSync(url, 'utf8').replace(/\r\n?/g, '\n')
  } catch {
    return ''
  }
}

const migration = readArtifact(
  new URL('../../../../supabase/migrations/042_trainer_relationships.sql', import.meta.url),
)
const consentRecoveryMigration = readArtifact(
  new URL('../../../../supabase/migrations/058_training_profile_consent_regrant.sql', import.meta.url),
)
const relationshipRpcMigrations = `${migration}\n${consentRecoveryMigration}`
const databaseTypes = readArtifact(new URL('../../../types/database.ts', import.meta.url))

const relationshipTables = [
  'trainer_service_offerings',
  'coaching_requests',
  'coaching_relationships',
  'coaching_consents',
]

type RelationshipRpcName =
  | 'grant_training_profile_consent'
  | 'grant_body_measurements_consent'
  | 'revoke_body_measurements_consent'
  | 'revoke_training_profile_consent'
  | 'end_coaching_relationship'
  | 'resume_paused_coaching_relationship'

const typedRelationshipRpcArgs = {
  grant_training_profile_consent: {
    p_relationship_id: 'relationship-id',
    p_consent_version: 'training-profile-v1',
    p_idempotency_key: 'idempotency-key',
  },
  grant_body_measurements_consent: {
    p_relationship_id: 'relationship-id',
    p_consent_version: 'body-measurements-v1',
    p_idempotency_key: 'idempotency-key',
  },
  revoke_body_measurements_consent: {
    p_relationship_id: 'relationship-id',
    p_idempotency_key: 'idempotency-key',
  },
  revoke_training_profile_consent: {
    p_relationship_id: 'relationship-id',
    p_idempotency_key: 'idempotency-key',
  },
  end_coaching_relationship: {
    p_relationship_id: 'relationship-id',
    p_reason: null,
    p_idempotency_key: 'idempotency-key',
  },
  resume_paused_coaching_relationship: {
    p_relationship_id: 'relationship-id',
    p_idempotency_key: 'idempotency-key',
  },
} satisfies { [Name in RelationshipRpcName]: Database['public']['Functions'][Name]['Args'] }

const typedRelationshipRpcReturns = {
  grant_training_profile_consent: [{ relationship_id: 'relationship-id', changed: true }],
  grant_body_measurements_consent: [{ relationship_id: 'relationship-id', changed: true }],
  revoke_body_measurements_consent: [{ relationship_id: 'relationship-id', changed: true }],
  revoke_training_profile_consent: [{ relationship_id: 'relationship-id', changed: true }],
  end_coaching_relationship: [{ relationship_id: 'relationship-id', changed: true }],
  resume_paused_coaching_relationship: [{ relationship_id: 'relationship-id', changed: true }],
} satisfies { [Name in RelationshipRpcName]: Database['public']['Functions'][Name]['Returns'] }

describe('trainer relationships migration', () => {
  it('keeps relationship RPC database types aligned with the exact SQL signatures', () => {
    const expectedArgs: Record<RelationshipRpcName, string[]> = {
      grant_training_profile_consent: ['p_relationship_id', 'p_consent_version', 'p_idempotency_key'],
      grant_body_measurements_consent: ['p_relationship_id', 'p_consent_version', 'p_idempotency_key'],
      revoke_body_measurements_consent: ['p_relationship_id', 'p_idempotency_key'],
      revoke_training_profile_consent: ['p_relationship_id', 'p_idempotency_key'],
      end_coaching_relationship: ['p_relationship_id', 'p_reason', 'p_idempotency_key'],
      resume_paused_coaching_relationship: ['p_relationship_id', 'p_idempotency_key'],
    }

    for (const [name, args] of Object.entries(expectedArgs) as [RelationshipRpcName, string[]][]) {
      const sqlContract = relationshipRpcMigrations.match(new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${name}\\(\\s*([\\s\\S]*?)\\s*\\)\\s*RETURNS TABLE \\(relationship_id UUID, changed BOOLEAN\\)`,
        'i',
      ))
      const typeContract = databaseTypes.match(new RegExp(
        `${name}: \\{\\s*Args: \\{([\\s\\S]*?)\\}\\s*Returns: \\{ relationship_id: string; changed: boolean \\}\\[\\]\\s*\\}`,
      ))

      expect(sqlContract, `${name} SQL contract`).toBeDefined()
      expect(typeContract, `${name} Database type contract`).toBeDefined()
      expect(sqlContract?.[1].match(/\bp_[a-z_]+(?=\s+UUID|\s+TEXT)/gi) ?? []).toEqual(args)
      expect(typeContract?.[1].match(/\bp_[a-z_]+(?=\??:)/gi) ?? []).toEqual(args)
      expect(Object.keys(typedRelationshipRpcArgs[name])).toEqual(args)
      expect(typedRelationshipRpcReturns[name]).toEqual([{ relationship_id: 'relationship-id', changed: true }])
    }
  })

  it('keeps training-profile recovery client-owned, exact-versioned, and serialized by the relationship', () => {
    const body = consentRecoveryMigration.match(
      /CREATE OR REPLACE FUNCTION public\.grant_training_profile_consent\([^]*?AS \$\$([^]*?)\$\$;/i,
    )?.[1] ?? ''

    expect(body).toContain('v_client_user_id UUID := auth.uid()')
    expect(body).toContain("v_version IS DISTINCT FROM 'training-profile-v1'")
    expect(body).toContain('relationship.client_user_id = v_client_user_id')
    expect(body).toContain('relationship.trainer_user_id = v_trainer_user_id')
    expect(body.indexOf('FROM public.coaching_relationships relationship')).toBeLessThan(
      body.indexOf('FROM public.coaching_consents consent'),
    )
    expect(body).not.toContain('UPDATE public.coaching_consents')
    expect(body).not.toContain('INSERT INTO public.professional_audit_logs')
  })

  it('creates the service, request, relationship, and scoped consent records under RLS', () => {
    for (const table of relationshipTables) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?public\\.${table}`, 'i'))
      expect(migration).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
      expect(databaseTypes).toContain(`${table}: {`)
    }
  })

  it('enforces the active relationship and pending duplicate invariants in the database', () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS coaching_relationships_one_active_client\s+ON public\.coaching_relationships\(client_user_id\)\s+WHERE status = 'active';/i,
    )
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS coaching_requests_one_pending_equivalent\s+ON public\.coaching_requests\s*\(client_user_id, trainer_user_id, service_id\)\s+WHERE status = 'pending';/i,
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

  it('keeps consent grants versioned while allowing only one active scope per relationship', () => {
    expect(migration).toMatch(/scope TEXT NOT NULL CHECK \(scope IN \('training_profile', 'body_measurements'\)\)/i)
    expect(migration).toMatch(/text_version TEXT NOT NULL/i)
    expect(migration).toMatch(/granted_at TIMESTAMPTZ NOT NULL/i)
    expect(migration).toMatch(/revoked_at TIMESTAMPTZ/i)
    expect(migration).toMatch(/granted_by UUID NOT NULL/i)
    expect(migration).toMatch(/revoked_by UUID/i)
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS coaching_consents_one_active_scope\s+ON public\.coaching_consents \(relationship_id, scope\)\s+WHERE revoked_at IS NULL/i)
    expect(migration).toMatch(/DROP CONSTRAINT IF EXISTS coaching_consents_relationship_id_scope_key/i)
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

  it('takes the trainer suspension lock before locking a paused relationship during resume', () => {
    const resume = migration.match(
      /CREATE OR REPLACE FUNCTION public\.resume_paused_coaching_relationship\([\s\S]+?END;\n\$\$;/i,
    )?.[0]

    expect(resume).toBeDefined()
    const trainerRead = resume!.indexOf('SELECT relationship.trainer_user_id INTO v_trainer_user_id')
    const trainerLock = resume!.indexOf('pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0))')
    const relationshipLock = resume!.indexOf('AND relationship.trainer_user_id = v_trainer_user_id\n  FOR UPDATE;')

    expect(trainerRead).toBeGreaterThanOrEqual(0)
    expect(trainerLock).toBeGreaterThan(trainerRead)
    expect(relationshipLock).toBeGreaterThan(trainerLock)
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

  it('keeps service offerings owner-only until the safe directory projection exists', () => {
    expect(migration).not.toMatch(/trainer_service_offerings: read active trainer services/i)
    expect(migration).not.toMatch(/CREATE POLICY "trainer_service_offerings: public/i)
  })
})
