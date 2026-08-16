import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/043_trainer_programming.sql', import.meta.url),
  'utf8',
).replace(/\r\n?/g, '\n')
const databaseTypes = readFileSync(new URL('../../../types/database.ts', import.meta.url), 'utf8')

const tables = [
  'trainer_program_templates',
  'trainer_template_workouts',
  'trainer_template_exercises',
  'trainer_plan_assignments',
  'trainer_assignment_versions',
]

describe('trainer programming migration', () => {
  it('creates the owned template and immutable assignment model under RLS', () => {
    for (const table of tables) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}`, 'i'))
      expect(migration).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`, 'i'))
      expect(databaseTypes).toContain(`${table}: {`)
    }
  })

  it('keeps trainer templates attached to their active owner and exercises in the catalog', () => {
    expect(migration).toMatch(/trainer_user_id UUID NOT NULL REFERENCES public\.profiles\(id\)/i)
    expect(migration).toMatch(/REFERENCES public\.trainer_program_templates\(id\) ON DELETE CASCADE/i)
    expect(migration).toMatch(/REFERENCES public\.exercises\(id\) ON DELETE RESTRICT/i)
    expect(migration).toMatch(/trainer_program_templates: manage active owner[\s\S]+trainer_profile\.user_id = auth\.uid\(\)[\s\S]+trainer_profile\.status = 'active'[\s\S]+public\.is_account_active\(auth\.uid\(\)\)/i)
  })

  it('ties assignments to active coaching relationships and preserves version history', () => {
    expect(migration).toMatch(/relationship_id UUID NOT NULL REFERENCES public\.coaching_relationships\(id\) ON DELETE RESTRICT/i)
    expect(migration).toMatch(/client_user_id UUID NOT NULL REFERENCES public\.profiles\(id\) ON DELETE RESTRICT/i)
    expect(migration).toMatch(/UNIQUE \(assignment_id, version_number\)/i)
    expect(migration).toMatch(/effective_from TIMESTAMPTZ NOT NULL/i)
    expect(migration).toMatch(/effective_to TIMESTAMPTZ/i)
    expect(migration).toMatch(/effective_to IS NULL OR effective_to > effective_from/i)
    expect(migration).toMatch(/snapshot JSONB NOT NULL/i)
    expect(migration).toMatch(/status TEXT NOT NULL[\s\S]+\('proposed', 'active', 'superseded', 'frozen', 'cancelled'\)/i)
    expect(migration).toMatch(/CREATE UNIQUE INDEX (?:IF NOT EXISTS )?trainer_plan_assignments_one_active_client[\s\S]+WHERE status = 'active'/i)
  })

  it('rejects an assignment whose source template belongs to another trainer', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.require_trainer_assignment_relationship_match\(\)[\s\S]+NEW\.source_template_id IS NOT NULL[\s\S]+template\.id = NEW\.source_template_id[\s\S]+template\.trainer_user_id = NEW\.trainer_user_id[\s\S]+TRAINER_ASSIGNMENT_TEMPLATE_OWNER_MISMATCH/i)
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF relationship_id, trainer_user_id, client_user_id, source_template_id ON public\.trainer_plan_assignments/i)
  })

  it('allows participant reads only while both accounts remain active and never grants direct snapshot mutation', () => {
    expect(migration).toMatch(/trainer_plan_assignments: read active participants[\s\S]+auth\.uid\(\) = trainer_plan_assignments\.client_user_id OR auth\.uid\(\) = relationship\.trainer_user_id[\s\S]+public\.is_account_active\(trainer_plan_assignments\.client_user_id\)[\s\S]+public\.is_account_active\(relationship\.trainer_user_id\)/i)
    expect(migration).toMatch(/trainer_assignment_versions: read active participants/i)
    expect(migration).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE public\.trainer_assignment_versions TO authenticated/i)
    expect(migration).not.toMatch(/GRANT (?:INSERT|UPDATE|DELETE|ALL) ON TABLE public\.trainer_plan_assignments TO authenticated/i)
  })

  it('rejects mutable published snapshots and deletes of referenced versions', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.guard_trainer_assignment_version_immutability\(\)/i)
    expect(migration).toMatch(/NEW\.snapshot IS DISTINCT FROM OLD\.snapshot[\s\S]+TRAINER_ASSIGNMENT_SNAPSHOT_IMMUTABLE/i)
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.guard_referenced_trainer_assignment_version_delete\(\)/i)
    expect(migration).toMatch(/TRAINER_ASSIGNMENT_VERSION_REFERENCED/i)
    expect(migration).toMatch(/CREATE TRIGGER trg_trainer_assignment_versions_immutable/i)
    expect(migration).toMatch(/CREATE TRIGGER trg_trainer_assignment_versions_referenced_delete/i)
  })

  it('serializes both template reorder RPCs with suspension before validating active ownership', () => {
    for (const functionName of ['reorder_trainer_template_workouts', 'reorder_trainer_template_exercises']) {
      const rpc = migration.match(
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${functionName}\\([\\s\\S]+?END;\\n\\$\\$;`, 'i'),
      )?.[0]

      expect(rpc).toBeDefined()
      const trainerLookup = rpc!.indexOf('INTO v_trainer_user_id')
      const trainerLock = rpc!.indexOf('pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0))')
      const accountLock = rpc!.indexOf('FROM public.profiles profile')
      const activeAccountGuard = rpc!.indexOf("profile.account_status = 'active'")
      const activeProfileGuard = rpc!.indexOf("profile.status = 'active'")

      expect(trainerLookup).toBeGreaterThanOrEqual(0)
      expect(trainerLock).toBeGreaterThan(trainerLookup)
      expect(accountLock).toBeGreaterThan(trainerLock)
      expect(activeAccountGuard).toBeGreaterThan(trainerLock)
      expect(activeProfileGuard).toBeGreaterThan(activeAccountGuard)
    }
  })

  it('uses the administrative suspension lock for a proposed assignment before it revalidates rows', () => {
    const rpc = migration.match(/CREATE OR REPLACE FUNCTION public\.propose_trainer_assignment\([\s\S]+?END;\n\$\$;/i)?.[0]
    expect(rpc).toBeDefined()
    const clientLock = rpc!.indexOf('pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0))')
    const suspensionLock = rpc!.indexOf('pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0))')
    const relationshipLock = rpc!.indexOf('SELECT * INTO v_relationship')
    const accountLock = rpc!.indexOf('FROM public.profiles profile')
    const profileLock = rpc!.indexOf('FROM public.trainer_profiles profile')

    expect(clientLock).toBeGreaterThanOrEqual(0)
    expect(suspensionLock).toBeGreaterThan(clientLock)
    expect(relationshipLock).toBeGreaterThan(suspensionLock)
    expect(accountLock).toBeGreaterThan(relationshipLock)
    expect(profileLock).toBeGreaterThan(accountLock)
  })
})
