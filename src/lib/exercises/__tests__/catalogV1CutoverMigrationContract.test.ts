import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../../../infra/supabase/migrations/20260907230000_exercise_catalog_v1_cutover.sql',
  import.meta.url,
)

const readMigration = () => existsSync(migrationUrl)
  ? readFileSync(migrationUrl, 'utf8').replace(/\r\n?/g, '\n')
  : ''

type ManifestExercise = {
  slug: string
  legacySource?: string
  legacyExternalId?: string
}

type ContractRow = {
  external_id: string
  legacy_source: string | null
  legacy_external_id: string | null
}

const manifest = JSON.parse(readFileSync(
  new URL('../../../../public/exercises/catalog/v1/manifest.json', import.meta.url),
  'utf8',
)) as { exercises: ManifestExercise[] }

const approvedRows: ContractRow[] = manifest.exercises.map(exercise => ({
  external_id: exercise.slug,
  legacy_source: exercise.legacySource ?? null,
  legacy_external_id: exercise.legacyExternalId ?? null,
}))

const extractFunction = (migration: string, name: string) => {
  const match = migration.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]+?\\n\\$\\$;`,
    'i',
  ))

  return match?.[0] ?? ''
}

const extractJsonConstant = (rpc: string, name: string, tag: string) => {
  const match = rpc.match(new RegExp(
    `${name}\\s+CONSTANT JSONB := \\$${tag}\\$([\\s\\S]+?)\\$${tag}\\$::JSONB`,
    'i',
  ))

  return match?.[1] ? JSON.parse(match[1]) as unknown : null
}

const rowSlugs = (rows: ContractRow[]) => rows
  .map(row => row.external_id)
  .sort()

const rowAliases = (rows: ContractRow[]) => rows
  .filter(row => row.legacy_source !== null)
  .map(row => [row.legacy_source, row.legacy_external_id, row.external_id])
  .sort((left, right) => {
    const leftKey = JSON.stringify(left)
    const rightKey = JSON.stringify(right)
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })

const matchesEmbeddedContract = (
  rows: ContractRow[],
  slugs: unknown,
  aliases: unknown,
) => JSON.stringify(rowSlugs(rows)) === JSON.stringify(slugs)
  && JSON.stringify(rowAliases(rows)) === JSON.stringify(aliases)

describe('Catalog V1 active cutover migration', () => {
  it('exists only on the active infra migration line and adds the motion column', () => {
    const migration = readMigration()

    expect(existsSync(migrationUrl)).toBe(true)
    expect(migration).toMatch(
      /ALTER TABLE public\.exercises\s+ADD COLUMN IF NOT EXISTS motion_preview_url TEXT/i,
    )
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_source_external[\s\S]+\(source, external_id\)[\s\S]+WHERE source IS NOT NULL AND external_id IS NOT NULL/i,
    )
  })

  it('creates a public WebP-only exercise-media bucket and public read policy', () => {
    const migration = readMigration()

    expect(migration).toMatch(
      /INSERT INTO storage\.buckets[\s\S]+['"]exercise-media['"][\s\S]+true[\s\S]+image\/webp[\s\S]+ON CONFLICT \(id\) DO UPDATE/i,
    )
    expect(migration).toMatch(
      /CREATE POLICY "exercise-media: public read"\s+ON storage\.objects\s+FOR SELECT\s+TO PUBLIC\s+USING \(bucket_id = 'exercise-media'\)/i,
    )
  })

  it('defines a fixed-search-path SECURITY DEFINER cutover callable only by service_role', () => {
    const migration = readMigration()
    const rpc = extractFunction(migration, 'replace_exercise_catalog_v1')

    expect(rpc).toMatch(
      /replace_exercise_catalog_v1\(p_exercises JSONB\)[\s\S]+RETURNS JSONB[\s\S]+LANGUAGE plpgsql[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = public, pg_temp/i,
    )
    expect(rpc).toMatch(/v_actor_role[\s\S]+service_role[\s\S]+insufficient_privilege/i)
    expect(rpc).toContain(
      "pg_advisory_xact_lock(hashtextextended('replace_exercise_catalog_v1', 0))",
    )
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.replace_exercise_catalog_v1(JSONB) FROM PUBLIC, anon, authenticated, service_role',
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.replace_exercise_catalog_v1(JSONB) TO service_role',
    )
    expect(migration).not.toContain(
      'GRANT EXECUTE ON FUNCTION public.replace_exercise_catalog_v1(JSONB) TO authenticated',
    )
  })

  it('rejects anything except 50 unique V1 slugs and validates exact legacy aliases', () => {
    const rpc = extractFunction(readMigration(), 'replace_exercise_catalog_v1')

    expect(rpc).toMatch(/jsonb_typeof\(p_exercises\)\s*<>\s*'array'/i)
    expect(rpc).toMatch(/jsonb_array_length\(p_exercises\)\s*<>\s*50/i)
    expect(rpc).toMatch(/COUNT\(DISTINCT[\s\S]+external_id[\s\S]+<>\s*50/i)
    expect(rpc).toMatch(/source\s+IS DISTINCT FROM\s+'vekira-catalog-v1'/i)
    expect(rpc).toContain("btrim(payload.external_id) !~ '^[a-z0-9]+(-[a-z0-9]+)*$'")
    expect(rpc).toMatch(
      /\(payload\.legacy_source IS NULL\)\s*<>\s*\(payload\.legacy_external_id IS NULL\)/i,
    )
    expect(rpc).toMatch(
      /legacy_source IS NOT NULL[\s\S]+COUNT\(DISTINCT[\s\S]+legacy_source[\s\S]+legacy_external_id/i,
    )
  })

  it('embeds and compares the exact 50 approved slugs and 21 legacy triples', () => {
    const rpc = extractFunction(readMigration(), 'replace_exercise_catalog_v1')
    const expectedSlugs = extractJsonConstant(rpc, 'v_expected_slugs', 'slugs')
    const expectedAliases = extractJsonConstant(rpc, 'v_expected_legacy_aliases', 'aliases')

    expect(expectedSlugs).toEqual(rowSlugs(approvedRows))
    expect(expectedAliases).toEqual(rowAliases(approvedRows))
    expect(expectedSlugs).toHaveLength(50)
    expect(expectedAliases).toHaveLength(21)
    expect(rpc).toMatch(
      /jsonb_agg\(to_jsonb\(payload\.external_id\) ORDER BY payload\.external_id COLLATE "C"\)[\s\S]+IS DISTINCT FROM v_expected_slugs/i,
    )
    expect(rpc).toMatch(
      /jsonb_agg\([\s\S]+jsonb_build_array\([\s\S]+payload\.legacy_source,[\s\S]+payload\.legacy_external_id,[\s\S]+payload\.external_id[\s\S]+IS DISTINCT FROM v_expected_legacy_aliases/i,
    )

    const exactContract = rpc.indexOf('IS DISTINCT FROM v_expected_legacy_aliases')
    const enableExerciseLogRemap = rpc.indexOf(
      "set_config('app.exercise_catalog_v1_remap', 'authorized', TRUE)",
    )
    expect(exactContract).toBeGreaterThan(0)
    expect(enableExerciseLogRemap).toBeGreaterThan(exactContract)
  })

  it('rejects a substituted slug or an invented legacy alias against the embedded contract', () => {
    const rpc = extractFunction(readMigration(), 'replace_exercise_catalog_v1')
    const expectedSlugs = extractJsonConstant(rpc, 'v_expected_slugs', 'slugs')
    const expectedAliases = extractJsonConstant(rpc, 'v_expected_legacy_aliases', 'aliases')
    const substitutedSlug = approvedRows.map((row, index) => index === 0
      ? { ...row, external_id: 'slug-inventado' }
      : row)
    const inventedAlias = approvedRows.map((row, index) => index === 1
      ? {
          ...row,
          legacy_source: 'fuente-inventada',
          legacy_external_id: 'alias-inventado',
        }
      : row)

    expect(matchesEmbeddedContract(approvedRows, expectedSlugs, expectedAliases)).toBe(true)
    expect(matchesEmbeddedContract(substitutedSlug, expectedSlugs, expectedAliases)).toBe(false)
    expect(matchesEmbeddedContract(inventedAlias, expectedSlugs, expectedAliases)).toBe(false)
  })

  it('upserts the 50 database rows by source and external_id inside the RPC', () => {
    const rpc = extractFunction(readMigration(), 'replace_exercise_catalog_v1')

    expect(rpc).toMatch(
      /jsonb_to_recordset\(p_exercises\)[\s\S]+legacy_source TEXT[\s\S]+legacy_external_id TEXT/i,
    )
    expect(rpc).toMatch(
      /INSERT INTO public\.exercises[\s\S]+motion_preview_url[\s\S]+ON CONFLICT \(source, external_id\)[\s\S]+DO UPDATE SET/i,
    )
    expect(rpc).not.toMatch(
      /INSERT INTO public\.exercises\s*\([^)]*(?:legacy_source|legacy_external_id)/i,
    )
    expect(rpc).toMatch(/v_inserted_count\s*:=\s*50\s*-\s*v_updated_count/i)
  })

  it('remaps all three reference tables by exact legacy source IDs before retirement', () => {
    const rpc = extractFunction(readMigration(), 'replace_exercise_catalog_v1')
    const remap = rpc.indexOf('CREATE TEMP TABLE catalog_v1_remap')
    const exerciseLogs = rpc.indexOf('UPDATE public.exercise_logs')
    const workoutExercises = rpc.indexOf('UPDATE public.workout_exercises')
    const templateExercises = rpc.indexOf('UPDATE public.trainer_template_exercises')
    const retirement = rpc.indexOf('UPDATE public.exercises AS legacy')

    expect(rpc).toMatch(
      /legacy\.source = payload\.legacy_source[\s\S]+legacy\.external_id = payload\.legacy_external_id[\s\S]+replacement\.source = 'vekira-catalog-v1'[\s\S]+replacement\.external_id = payload\.external_id/i,
    )
    expect(rpc).not.toMatch(/legacy\.name\s*=|lower\(legacy\.name\)/i)
    expect(remap).toBeGreaterThan(0)
    expect(exerciseLogs).toBeGreaterThan(remap)
    expect(workoutExercises).toBeGreaterThan(exerciseLogs)
    expect(templateExercises).toBeGreaterThan(workoutExercises)
    expect(retirement).toBeGreaterThan(templateExercises)
    expect(rpc).toMatch(
      /GET DIAGNOSTICS v_exercise_logs_remapped_count = ROW_COUNT[\s\S]+GET DIAGNOSTICS v_workout_exercises_remapped_count = ROW_COUNT[\s\S]+GET DIAGNOSTICS v_trainer_template_exercises_remapped_count = ROW_COUNT/i,
    )
  })

  it('opens only a transaction-local, field-limited path through immutable exercise logs', () => {
    const migration = readMigration()
    const guard = extractFunction(migration, 'enforce_exercise_log_immutability')
    const rpc = extractFunction(migration, 'replace_exercise_catalog_v1')

    expect(guard).toMatch(
      /current_setting\('app\.exercise_catalog_v1_remap', TRUE\) = 'authorized'[\s\S]+current_user = 'postgres'[\s\S]+NEW\.exercise_id IS DISTINCT FROM OLD\.exercise_id[\s\S]+to_jsonb\(NEW\) - 'exercise_id'[\s\S]+to_jsonb\(OLD\) - 'exercise_id'[\s\S]+RETURN NEW/i,
    )
    expect(guard).toContain("RAISE EXCEPTION 'SESSION_EXERCISE_EVIDENCE_IMMUTABLE'")
    expect(rpc).toContain(
      "set_config('app.exercise_catalog_v1_remap', 'authorized', TRUE)",
    )
    expect(rpc).toContain(
      "set_config('app.trainer_prescription_mutation', 'authorized', TRUE)",
    )
  })

  it('retires every non-current public row and deletes only candidates unreferenced by all FK tables', () => {
    const rpc = extractFunction(readMigration(), 'replace_exercise_catalog_v1')

    expect(rpc).toMatch(
      /UPDATE public\.exercises AS legacy[\s\S]+SET is_public = FALSE[\s\S]+legacy\.is_public = TRUE[\s\S]+NOT EXISTS[\s\S]+payload\.source = legacy\.source[\s\S]+payload\.external_id = legacy\.external_id/i,
    )
    expect(rpc).toMatch(
      /DELETE FROM public\.exercises AS legacy[\s\S]+legacy\.id = ANY\(v_legacy_public_ids\)[\s\S]+NOT EXISTS \([\s\S]+FROM public\.exercise_logs[\s\S]+NOT EXISTS \([\s\S]+FROM public\.workout_exercises[\s\S]+NOT EXISTS \([\s\S]+FROM public\.trainer_template_exercises/i,
    )
    expect(rpc).toMatch(/v_hidden_count\s*:=\s*v_legacy_public_count\s*-\s*v_deleted_count/i)
  })

  it('keeps referenced private exercises readable only to their owning authenticated user', () => {
    const migration = readMigration()
    const helper = extractFunction(migration, 'can_read_referenced_private_exercise')

    expect(helper).toMatch(
      /RETURNS BOOLEAN[\s\S]+LANGUAGE sql[\s\S]+STABLE[\s\S]+SECURITY DEFINER[\s\S]+SET search_path = public, pg_temp/i,
    )
    expect(helper).toMatch(
      /public\.workout_exercises[\s\S]+public\.workouts[\s\S]+workout\.user_id = auth\.uid\(\)/i,
    )
    expect(helper).toMatch(
      /public\.exercise_logs[\s\S]+public\.progress_logs[\s\S]+progress\.user_id = auth\.uid\(\)/i,
    )
    expect(helper).toMatch(
      /public\.trainer_template_exercises[\s\S]+public\.trainer_template_workouts[\s\S]+public\.trainer_program_templates[\s\S]+template\.trainer_user_id = auth\.uid\(\)/i,
    )
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.can_read_referenced_private_exercise(UUID) FROM PUBLIC, anon, authenticated, service_role',
    )
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.can_read_referenced_private_exercise(UUID) TO authenticated',
    )
    expect(migration).toMatch(
      /CREATE POLICY "exercises: referenced private read"[\s\S]+FOR SELECT TO authenticated[\s\S]+USING \(is_public = FALSE AND public\.can_read_referenced_private_exercise\(id\)\)/i,
    )
  })

  it('returns cutover, remap and final public-catalog counts', () => {
    const rpc = extractFunction(readMigration(), 'replace_exercise_catalog_v1')

    for (const key of [
      'source',
      'input_count',
      'inserted_count',
      'updated_count',
      'hidden_count',
      'deleted_count',
      'exercise_logs_remapped_count',
      'workout_exercises_remapped_count',
      'trainer_template_exercises_remapped_count',
      'public_v1_count',
      'public_legacy_count',
    ]) {
      expect(rpc).toContain(`'${key}'`)
    }

    expect(rpc).toMatch(/v_public_v1_count\s*<>\s*50/i)
    expect(rpc).toMatch(/v_public_legacy_count\s*<>\s*0/i)
  })

  it('projects motion_preview_url from the active detail payload RPC', () => {
    const migration = readMigration()
    const detail = extractFunction(migration, 'get_exercise_detail_payload')

    expect(detail).toContain('e.video_url, e.image_url, e.motion_preview_url')
    expect(detail).toMatch(
      /WHERE e\.id = p_exercise_id[\s\S]+e\.is_public = true[\s\S]+public\.can_read_referenced_private_exercise\(e\.id\)/i,
    )
  })
})
