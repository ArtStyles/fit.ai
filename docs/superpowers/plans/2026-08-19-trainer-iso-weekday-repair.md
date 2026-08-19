# Trainer ISO Weekday Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair professional workout weekday materialization so snapshots, live workouts, coach insights, and future writes use ISO 8601 values `1..7` without shifting.

**Architecture:** Add an immutable-history-safe migration `049` that validates and repairs only professional materializations from their version snapshots, then replaces the four faulty final routines and installs a defensive workout trigger. Make the Docker harness reproduce the production `CHECK`, apply the exact 040–049 sequence including the unrelated 047/048 migrations, and exercise failed preflight, backfill, Monday/Sunday materialization, revision, insights, rerunnability, and session continuity before updating deployment documentation.

**Tech Stack:** PostgreSQL 17 / PL/pgSQL, Supabase migrations and RLS, pgTAP, Node.js ESM Docker harness, TypeScript, Vitest, pnpm, Markdown.

**Spec:** `docs/superpowers/specs/2026-08-19-trainer-iso-weekday-repair-design.md`

## Global Constraints

- ISO 8601 `1=lunes` through `7=domingo` is the only weekday convention.
- Do not edit deployed migrations `043_trainer_programming.sql`, `045_trainer_hardening.sql`, `046_release_session_authorization.sql`, `047_product_notification_preferences_insert.sql`, or `048_profile_weight_measurement_sync.sql`; `049` must override their final trainer routines.
- Backfill only `workout_plans.source_type = 'trainer_assigned'` and derive the exact value from the immutable assignment-version snapshot by `orderInPlan`.
- Never infer recovery with `day_of_week + 1` and never rewrite templates, snapshots, audit logs, authorization snapshots, progress logs, or personal plans.
- Migration 049 must not issue `UPDATE`/`DELETE` against `session_authorizations`,
  `progress_logs`, `exercise_logs`, `professional_audit_logs`, or any snapshot
  column; completed and in-flight evidence remains immutable.
- Any ambiguous link, malformed snapshot, duplicate day/order, or cardinality mismatch aborts the full migration with `TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED` and aggregated diagnostics only.
- Preserve all existing RPC signatures, payloads, locking, idempotency, `SECURITY DEFINER`, owner, `search_path`, and grants except for the weekday expressions being repaired.
- A professional workout write that disagrees with its snapshot must fail with `TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH`.
- Tests must be observed failing before the corresponding implementation, and the PostgreSQL Docker suite is mandatory.
- Preserve the four unrelated untracked documents already present in the worktree; stage only files named by the current task.

---

### Task 1: Static migration contract and transactional repair

**Files:**
- Create: `src/lib/coaching/__tests__/trainerIsoWeekdayMigration.test.ts`
- Create: `supabase/migrations/049_trainer_iso_weekday_repair.sql`
- Read source bodies from: `supabase/migrations/043_trainer_programming.sql:832`, `supabase/migrations/043_trainer_programming.sql:1249`, `supabase/migrations/045_trainer_hardening.sql:83`, `supabase/migrations/045_trainer_hardening.sql:386`

**Interfaces:**
- Produces: migration `049_trainer_iso_weekday_repair.sql`.
- Produces: `public.enforce_trainer_workout_iso_schedule()` trigger function.
- Produces: `trg_enforce_trainer_workout_iso_schedule` on `public.workouts`.
- Produces: final `public.trainer_security_preflight()` returning integer `49`.
- Preserves: the four existing public RPC signatures and ACL contracts.

- [ ] **Step 1: Write the failing static contract test**

Create `src/lib/coaching/__tests__/trainerIsoWeekdayMigration.test.ts` with helpers that extract a complete PL/pgSQL function body and assertions scoped to the final migration:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/049_trainer_iso_weekday_repair.sql', import.meta.url),
  'utf8',
).replace(/\r\n?/g, '\n')

function routine(name: string) {
  const body = migration.match(
    new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]+?\\n\\$\\$;`, 'i'),
  )?.[0]
  expect(body, `${name} must be replaced by migration 049`).toBeDefined()
  return body!
}

describe('trainer ISO weekday repair migration', () => {
  it('is transactional and repairs only professional materializations from snapshot order', () => {
    expect(migration).toMatch(/^BEGIN;/m)
    expect(migration).toMatch(/LOCK TABLE[\s\S]+trainer_plan_assignments[\s\S]+trainer_assignment_versions[\s\S]+workout_plans[\s\S]+workouts[\s\S]+SHARE ROW EXCLUSIVE/i)
    expect(migration).toMatch(/source_type = 'trainer_assigned'/i)
    expect(migration).toMatch(/order_in_plan[\s\S]+orderInPlan/i)
    expect(migration).toMatch(/IS DISTINCT FROM[\s\S]+expected_day_of_week/i)
    expect(migration).toContain('TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED')
    expect(migration).toMatch(/COMMIT;\s*$/)
  })

  it('removes the shift from both materializers and both final insight projections', () => {
    for (const name of [
      'propose_trainer_assignment',
      'publish_trainer_assignment_revision',
      'get_coach_clients_summary',
      'get_coach_client_insights',
    ]) {
      const body = routine(name)
      expect(body).not.toMatch(/dayOfWeek[^\n]*-\s*1/i)
    }
    expect(routine('propose_trainer_assignment')).toMatch(/NULLIF\(v_workout->>'dayOfWeek', ''\)::INTEGER/)
    expect(routine('publish_trainer_assignment_revision')).toMatch(/NULLIF\(v_workout->>'dayOfWeek', ''\)::INTEGER/)
  })

  it('installs an ISO snapshot guard with closed direct execution', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.enforce_trainer_workout_iso_schedule\(\)/i)
    expect(migration).toContain('TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH')
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF plan_id, day_of_week, order_in_plan ON public\.workouts/i)
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.enforce_trainer_workout_iso_schedule\(\) FROM PUBLIC, anon, authenticated, service_role/i)
  })

  it('advances the catalog preflight only after checking 046 and the ISO guard', () => {
    const preflight = routine('trainer_security_preflight')
    expect(preflight).toContain("to_regprocedure('public.release_session_authorization(uuid,uuid)')")
    expect(preflight).toContain("to_regprocedure('public.enforce_trainer_workout_iso_schedule()')")
    expect(preflight).toContain('trg_enforce_trainer_workout_iso_schedule')
    expect(preflight).toMatch(/RETURN 49/)
  })
})
```

- [ ] **Step 2: Run the focal test and verify the red state**

Run:

```powershell
pnpm vitest run src/lib/coaching/__tests__/trainerIsoWeekdayMigration.test.ts
```

Expected: FAIL because `049_trainer_iso_weekday_repair.sql` does not exist.

- [ ] **Step 3: Create the transaction, locks, structural preflight, and exact backfill**

Start `supabase/migrations/049_trainer_iso_weekday_repair.sql` with an explicit transaction and a bounded lock wait:

```sql
BEGIN;
SET LOCAL lock_timeout = '15s';

LOCK TABLE
  public.trainer_plan_assignments,
  public.trainer_assignment_versions,
  public.workout_plans,
  public.workouts
IN SHARE ROW EXCLUSIVE MODE;
```

Use separate `DO` checks before expanding JSON. Each branch raises the same public code and includes only a category/count, for example:

```sql
DO $$
DECLARE
  v_invalid_count BIGINT;
BEGIN
  SELECT count(*) INTO v_invalid_count
  FROM public.workout_plans plan
  LEFT JOIN public.trainer_assignment_versions version
    ON version.id = plan.trainer_assignment_version_id
   AND version.materialized_plan_id = plan.id
  WHERE plan.source_type = 'trainer_assigned'
    AND version.id IS NULL;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED: invalid_plan_version_links=%', v_invalid_count;
  END IF;
END;
$$;
```

In the same first block, count reverse links with this exact predicate and fail
with the same code/category when it is nonzero:

```sql
SELECT count(*) INTO v_invalid_count
FROM public.trainer_assignment_versions version
LEFT JOIN public.workout_plans plan
  ON plan.id = version.materialized_plan_id
 AND plan.trainer_assignment_version_id = version.id
 AND plan.source_type = 'trainer_assigned'
WHERE version.materialized_plan_id IS NOT NULL
  AND plan.id IS NULL;
```

Validate array shape before expansion, then create a raw temporary relation:

```sql
CREATE TEMP TABLE trainer_iso_weekday_snapshot_rows ON COMMIT DROP AS
SELECT
  plan.id AS plan_id,
  snapshot_workout.value AS snapshot_workout
FROM public.workout_plans plan
JOIN public.trainer_assignment_versions version
  ON version.id = plan.trainer_assignment_version_id
 AND version.materialized_plan_id = plan.id
CROSS JOIN LATERAL jsonb_array_elements(version.snapshot->'workouts') AS snapshot_workout(value)
WHERE plan.source_type = 'trainer_assigned';
```

The array-shape query must reject `NULL`, non-array, and empty arrays:

```sql
CASE
  WHEN jsonb_typeof(version.snapshot->'workouts') = 'array'
    THEN jsonb_array_length(version.snapshot->'workouts') = 0
  ELSE TRUE
END
```

Use one further `DO` block with separate aggregated counts. Its invalid-entry
predicate and duplicate groups are:

```sql
jsonb_typeof(snapshot_workout) IS DISTINCT FROM 'object'
OR COALESCE(snapshot_workout->>'dayOfWeek', '') !~ '^[1-7]$'
OR COALESCE(snapshot_workout->>'orderInPlan', '') !~ '^[1-7]$'

SELECT plan_id, snapshot_workout->>'dayOfWeek'
FROM trainer_iso_weekday_snapshot_rows
GROUP BY plan_id, snapshot_workout->>'dayOfWeek'
HAVING count(*) > 1

SELECT plan_id, snapshot_workout->>'orderInPlan'
FROM trainer_iso_weekday_snapshot_rows
GROUP BY plan_id, snapshot_workout->>'orderInPlan'
HAVING count(*) > 1
```

After those regex checks make integer casts safe, count unmatched rows in both
directions with a full join:

```sql
SELECT count(*) INTO v_invalid_count
FROM trainer_iso_weekday_snapshot_rows snapshot_row
FULL JOIN public.workouts workout
  ON workout.plan_id = snapshot_row.plan_id
 AND workout.order_in_plan = (snapshot_row.snapshot_workout->>'orderInPlan')::INTEGER
JOIN public.workout_plans plan
  ON plan.id = COALESCE(snapshot_row.plan_id, workout.plan_id)
 AND plan.source_type = 'trainer_assigned'
WHERE snapshot_row.plan_id IS NULL OR workout.id IS NULL;
```

This full join covers missing materialized rows, extra materialized rows, and
most cardinality mismatches. Also reject duplicated materialized orders and
compare counts explicitly:

```sql
SELECT plan_id, order_in_plan
FROM public.workouts
WHERE plan_id IN (
  SELECT id FROM public.workout_plans WHERE source_type = 'trainer_assigned'
)
GROUP BY plan_id, order_in_plan
HAVING count(*) > 1;

SELECT plan.id
FROM public.workout_plans plan
JOIN public.trainer_assignment_versions version
  ON version.id = plan.trainer_assignment_version_id
LEFT JOIN public.workouts workout ON workout.plan_id = plan.id
WHERE plan.source_type = 'trainer_assigned'
GROUP BY plan.id, version.snapshot
HAVING count(workout.id) <> jsonb_array_length(version.snapshot->'workouts');
```

Raise the public preflight code with category `snapshot_shape`,
`snapshot_value`, `duplicate_day`, `duplicate_order`,
`duplicate_materialized_order`, `unmatched_materialization`, or `cardinality`
and only its count. Only after all counts are zero, materialize the trusted
mapping in a transaction-local table:

```sql
CREATE TEMP TABLE trainer_iso_weekday_expected ON COMMIT DROP AS
SELECT
  workout.id AS workout_id,
  plan.id AS plan_id,
  (snapshot_workout.value->>'dayOfWeek')::INTEGER AS expected_day_of_week
FROM public.workout_plans plan
JOIN public.trainer_assignment_versions version
  ON version.id = plan.trainer_assignment_version_id
 AND version.materialized_plan_id = plan.id
CROSS JOIN LATERAL jsonb_array_elements(version.snapshot->'workouts') AS snapshot_workout(value)
JOIN public.workouts workout
  ON workout.plan_id = plan.id
 AND workout.order_in_plan = (snapshot_workout.value->>'orderInPlan')::INTEGER
WHERE plan.source_type = 'trainer_assigned';

ALTER TABLE trainer_iso_weekday_expected ADD PRIMARY KEY (workout_id);
CREATE TEMP TABLE trainer_iso_weekday_updated (
  workout_id UUID PRIMARY KEY,
  plan_id UUID NOT NULL
) ON COMMIT DROP;

SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);

WITH updated AS (
  UPDATE public.workouts workout
  SET day_of_week = expected.expected_day_of_week
  FROM trainer_iso_weekday_expected expected
  WHERE workout.id = expected.workout_id
    AND workout.day_of_week IS DISTINCT FROM expected.expected_day_of_week
  RETURNING workout.id, workout.plan_id
)
INSERT INTO trainer_iso_weekday_updated (workout_id, plan_id)
SELECT id, plan_id FROM updated;

RESET ROLE;
```

The explicit trusted role is required because the existing locked-prescription
guard authorizes the GUC only when `current_user='postgres'` (or through its
separate trusted service-role path). The migration runner already has authority
to assign routine ownership to `postgres`; do not disable the guard trigger.

Assert after the update that no expected/materialized day differs, every updated row still joins a `trainer_assigned` plan, and expected/materialized counts remain equal. Emit only aggregate `RAISE NOTICE` counts. Do not log IDs or JSON.

Use these postcondition predicates:

```sql
SELECT count(*)
FROM trainer_iso_weekday_expected expected
JOIN public.workouts workout ON workout.id = expected.workout_id
WHERE workout.day_of_week IS DISTINCT FROM expected.expected_day_of_week;

SELECT count(*)
FROM trainer_iso_weekday_updated updated
LEFT JOIN public.workout_plans plan
  ON plan.id = updated.plan_id
 AND plan.source_type = 'trainer_assigned'
WHERE plan.id IS NULL;
```

Either nonzero count raises `TRAINER_ISO_WEEKDAY_REPAIR_POSTCONDITION_FAILED`.

- [ ] **Step 4: Replace the four routines with their final definitions**

Copy the complete definitions, not abbreviated variants:

- `propose_trainer_assignment` from migration 043 lines 832–1069;
- `publish_trainer_assignment_revision` from migration 043 lines 1249–1401;
- `get_coach_clients_summary` from migration 045 lines 83–376;
- `get_coach_client_insights` from migration 045 lines 386–621.

Make only these four expression changes inside the copied bodies:

```sql
-- propose_trainer_assignment and publish_trainer_assignment_revision
NULLIF(v_workout->>'dayOfWeek', '')::INTEGER

-- get_coach_clients_summary
materialized_workout.day_of_week = NULLIF(prescribed.value->>'dayOfWeek', '')::INTEGER

-- get_coach_client_insights
indexed_workout.day_of_week = NULLIF(workout.value->>'dayOfWeek', '')::INTEGER
```

Immediately repeat the exact `ALTER FUNCTION ... OWNER TO postgres`, `REVOKE`, and `GRANT` statements from the source migration for each signature. Verify with a focused diff that no other line in each copied body changed.

- [ ] **Step 5: Add the defensive trigger**

Implement an invoker trigger that first distinguishes personal plans, then validates exactly one snapshot entry:

```sql
CREATE OR REPLACE FUNCTION public.enforce_trainer_workout_iso_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source_type TEXT;
  v_snapshot JSONB;
  v_match_count INTEGER;
  v_expected_day INTEGER;
BEGIN
  SELECT plan.source_type, version.snapshot
  INTO v_source_type, v_snapshot
  FROM public.workout_plans plan
  LEFT JOIN public.trainer_assignment_versions version
    ON version.id = plan.trainer_assignment_version_id
  WHERE plan.id = NEW.plan_id;

  IF v_source_type IS DISTINCT FROM 'trainer_assigned' THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(v_snapshot->'workouts') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH';
  END IF;

  SELECT
    count(*),
    min(
      CASE WHEN item.value->>'dayOfWeek' ~ '^[1-7]$'
        THEN (item.value->>'dayOfWeek')::INTEGER
      END
    )
  INTO v_match_count, v_expected_day
  FROM jsonb_array_elements(v_snapshot->'workouts') AS item(value)
  WHERE CASE
    WHEN item.value->>'orderInPlan' ~ '^[1-7]$'
      THEN (item.value->>'orderInPlan')::INTEGER = NEW.order_in_plan
    ELSE FALSE
  END;

  IF v_match_count <> 1
    OR v_expected_day IS NULL
    OR v_expected_day NOT BETWEEN 1 AND 7
    OR NEW.day_of_week IS DISTINCT FROM v_expected_day THEN
    RAISE EXCEPTION 'TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_trainer_workout_iso_schedule() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enforce_trainer_workout_iso_schedule() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_enforce_trainer_workout_iso_schedule ON public.workouts;
CREATE TRIGGER trg_enforce_trainer_workout_iso_schedule
  BEFORE INSERT OR UPDATE OF plan_id, day_of_week, order_in_plan ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_trainer_workout_iso_schedule();
```

- [ ] **Step 6: Advance the operational preflight and close the transaction**

Copy the 045 `trainer_security_preflight()` catalog checks, add checks for migration 046, the trigger function, and an enabled non-internal trigger row:

```sql
OR to_regprocedure('public.release_session_authorization(uuid,uuid)') IS NULL
OR to_regprocedure('public.enforce_trainer_workout_iso_schedule()') IS NULL
OR NOT EXISTS (
  SELECT 1
  FROM pg_trigger trigger_row
  WHERE trigger_row.tgrelid = 'public.workouts'::regclass
    AND trigger_row.tgname = 'trg_enforce_trainer_workout_iso_schedule'
    AND trigger_row.tgenabled = 'O'
    AND NOT trigger_row.tgisinternal
)
```

Return `47`, retain `STABLE`, reapply the 045 grants, and end the file with `COMMIT;`.

- [ ] **Step 7: Run the static test green and inspect the migration diff**

Run:

```powershell
pnpm vitest run src/lib/coaching/__tests__/trainerIsoWeekdayMigration.test.ts
git diff --check -- supabase/migrations/049_trainer_iso_weekday_repair.sql src/lib/coaching/__tests__/trainerIsoWeekdayMigration.test.ts
```

Expected: the focal Vitest file passes and diff check exits `0`.

- [ ] **Step 8: Commit the migration contract and implementation**

```powershell
git add -- supabase/migrations/049_trainer_iso_weekday_repair.sql src/lib/coaching/__tests__/trainerIsoWeekdayMigration.test.ts
git commit -m "fix(trainer): repair ISO workout weekdays"
```

---

### Task 2: Production-faithful PostgreSQL regression suite

**Files:**
- Modify: `scripts/test-trainer-programming-db.mjs:13`
- Modify: `scripts/test-trainer-programming-db.mjs:104`
- Modify: `scripts/test-trainer-programming-db.mjs:575`
- Modify: `scripts/test-trainer-programming-db.mjs:597`
- Modify: `supabase/tests/043_trainer_programming_test.sql:5`
- Modify: `supabase/tests/043_trainer_programming_test.sql:61`
- Modify: `supabase/tests/043_trainer_programming_test.sql:146`
- Modify: `supabase/tests/043_trainer_programming_test.sql:707`
- Modify: `supabase/tests/044_trainer_insights_test.sql:56`
- Modify: `src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts`
- Read: `src/lib/coaching/__tests__/trainerSecurityMigration.test.ts`
- Create: `supabase/tests/049_trainer_iso_weekday_repair_test.sql`

**Interfaces:**
- Consumes: migration 049 and `trg_enforce_trainer_workout_iso_schedule` from Task 1.
- Produces: Docker schema with `workouts_day_of_week_check` matching production.
- Produces: `runPsqlExpectFailure(sql, label, expectedMessage)` for intentional migration-preflight failures.
- Produces: committed legacy fixture IDs under prefix `f4700000-...` for post-migration assertions.

- [ ] **Step 1: Write the failing prefix and final-order contracts before renaming the migration**

Read the real migration directory and add two separate tests: one that rejects
duplicate numeric prefixes in the 040–049 release segment, and another that
requires this exact ordered list:

```text
040_trainer_foundations.sql
041_trainer_verification.sql
042_trainer_relationships.sql
043_trainer_programming.sql
044_trainer_insights.sql
045_trainer_hardening.sql
046_release_session_authorization.sql
047_product_notification_preferences_insert.sql
048_profile_weight_measurement_sync.sql
049_trainer_iso_weekday_repair.sql
```

Keep the ISO rerun assertions in `trainerMigrationRerunContract.test.ts`:

```ts
const isoRepair = readFileSync(
  new URL('../../../../supabase/migrations/049_trainer_iso_weekday_repair.sql', import.meta.url),
  'utf8',
)
const trainerRunner = readFileSync(
  new URL('../../../../scripts/test-trainer-programming-db.mjs', import.meta.url),
  'utf8',
)

it('reapplies the ISO repair after every historical trainer routine', () => {
  expect(isoRepair).toMatch(/RETURN 49/i)
  expect(trainerRunner).toMatch(/043_trainer_programming\.sql[\s\S]+045_trainer_hardening\.sql[\s\S]+046_release_session_authorization\.sql[\s\S]+047_product_notification_preferences_insert\.sql[\s\S]+048_profile_weight_measurement_sync\.sql[\s\S]+049_trainer_iso_weekday_repair\.sql/i)
  expect(trainerRunner).toMatch(/trainerMigrationFiles\.map\(readMigration\)[\s\S]+reapplying migrations 040-049/i)
})
```

Run:

```powershell
pnpm vitest run src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts
```

Run each new test separately. Expected RED evidence: the prefix test receives
exactly `['047']`; the order test shows the ISO file as an extra 047 entry and
the 049 file as missing. Neither failure may be caused by an unreadable path.

- [ ] **Step 2: Make the harness load 046–049 and reproduce the real constraint**

Append these migration files in exact order:

```js
'045_trainer_hardening.sql',
'046_release_session_authorization.sql',
'047_product_notification_preferences_insert.sql',
'048_profile_weight_measurement_sync.sql',
'049_trainer_iso_weekday_repair.sql',
```

Change the bootstrap column to:

```sql
day_of_week INTEGER CHECK (day_of_week BETWEEN 1 AND 7)
```

Add:

```js
const isoWeekdayTestPath = path.join(repoRoot, 'supabase', 'tests', '049_trainer_iso_weekday_repair_test.sql')
```

- [ ] **Step 3: Add an expected-failure runner for atomic preflight testing**

Place beside `runPsql`:

```js
function runPsqlExpectFailure(sql, label, expectedMessage) {
  process.stdout.write(`\n[trainer-programming-db] ${label}\n`)
  const result = docker(
    ['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'],
    { input: sql, print: false },
  )
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  if (result.status === 0 || !output.includes(expectedMessage)) {
    throw new Error(`${label} did not fail with ${expectedMessage}: ${output}`)
  }
  return output
}
```

- [ ] **Step 4: Add committed malformed and recoverable fixtures before 049**

After applying 045, 046, 047-product, and 048, seed two isolated graphs under IDs beginning
`f4700000`:

- malformed graph: snapshot has two entries with `orderInPlan=1`, one materialized workout at day `6`;
- recoverable graph: snapshot has exactly one entry with `dayOfWeek=7, orderInPlan=1`, materialized workout day `6`;
- control personal plan: one workout at day `6` with `source_type='manual'`.

Use this stable ID map so seed, cleanup, and pgTAP agree:

| Row | ID suffix |
|---|---|
| trainer user | `0001` |
| client user | `0002` |
| trainer application | `0011` |
| trainer profile | `0021` |
| service | `0031` |
| relationship | `0041` |
| recoverable assignment / version / plan / workout | `0061` / `0071` / `0091` / `0101` |
| malformed assignment / version / plan / workout | `0062` / `0072` / `0093` / `0103` |
| personal control plan / workout | `0092` / `0102` |

Every UUID starts from `f4700000-0000-4000-8000-000000000000` and replaces
its final four digits with the listed suffix.

The seed must create legal `auth.users`, profiles, application, active trainer profile, service, active relationship, consent, assignment, version, and plan links. Wrap it in `BEGIN`, use `SET CONSTRAINTS ALL DEFERRED` around the version/plan cycle, then use this trusted context before inserting locked workouts:

```sql
SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
```

`COMMIT` restores the runner role. Do not disable FK, identity, or locked-plan triggers while creating either fixture.

Run 049 once with the malformed graph present:

```js
runPsqlExpectFailure(
  readMigration('049_trainer_iso_weekday_repair.sql'),
  'rejecting ambiguous ISO weekday repair',
  'TRAINER_ISO_WEEKDAY_REPAIR_PREFLIGHT_FAILED',
)
```

Immediately assert in SQL that recoverable day remains `6`, the personal day
remains `6`, and the migration trigger does not exist. Delete workout `0103`,
then delete version `0072`, plan `0093`, and assignment `0062` in one
transaction with constraints deferred; the shared relationship remains. Then
apply 049 normally. This demonstrates full rollback rather than only matching
an error string.

- [ ] **Step 5: Reorder the runner so behavior executes against the final schema**

Before adding the 049 application call, run:

```powershell
pnpm test:db:trainers
```

Expected red evidence: the main Monday proposal violates
`workouts_day_of_week_check` while the runner still exposes the 043 definition.
Record that error, then implement the final sequence below.

The application sequence must be:

```text
035, 037, 038
040, 041, 042, 043, 044
reapply 043, reapply 044
seed legacy professional audit
apply production owner boundary
apply 045, reapply 045
apply 046, 047 product preferences, 048 profile-weight sync
seed malformed + recoverable ISO fixtures
expect 049 preflight failure and verify rollback
remove malformed fixture only
apply 049
run 043, 044, 049, audit, and optional authorization pgTAP suites
run concurrency/continuity checks
capture rerun snapshot
reapply 040–049 with 049 last
verify rerun snapshot
```

Update the final PASS banner to `migrations 040-049`.

- [ ] **Step 6: Add Monday/Sunday proposal and revision assertions**

In the primary 043 fixture, change the second template workout day from `2` to `7`. Increase the pgTAP plan from `128` to `130` and add after the initial proposal:

```sql
SELECT is(
  (
    SELECT array_agg(workout.day_of_week ORDER BY workout.order_in_plan)
    FROM public.workouts workout
    JOIN public.workout_plans plan ON plan.id = workout.plan_id
    JOIN public.trainer_plan_assignments assignment ON assignment.id = plan.trainer_assignment_id
    WHERE assignment.proposal_idempotency_key = 'proposal-idempotency-1'
  ),
  ARRAY[1, 7],
  'proposal materializes Monday and Sunday with exact ISO days'
);
```

Add this assertion after `revision-publish-key`:

```sql
SELECT is(
  (
    SELECT array_agg(workout.day_of_week ORDER BY workout.order_in_plan)
    FROM public.workouts workout
    JOIN public.trainer_assignment_versions version
      ON version.materialized_plan_id = workout.plan_id
    WHERE version.revision_idempotency_key = 'revision-publish-key'
  ),
  ARRAY[1, 7],
  'revision materializes Monday and Sunday with exact ISO days'
);
```

- [ ] **Step 7: Correct the insight fixture to canonical ISO**

In `044_trainer_insights_test.sql`, replace:

```sql
EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Havana')::INTEGER - 1
```

with:

```sql
EXTRACT(ISODOW FROM NOW() AT TIME ZONE 'America/Havana')::INTEGER
```

Do not change the pgTAP count: the existing prescribed-workout-ID assertion is the regression signal for both final insight joins.

- [ ] **Step 8: Add focused backfill, trigger, preflight, and personal-control pgTAP**

Create `supabase/tests/049_trainer_iso_weekday_repair_test.sql`:

```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(6);

SELECT is(public.trainer_security_preflight(), 49, 'trainer preflight marks the ISO repair');
SELECT is(
  (SELECT day_of_week FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000101'),
  7,
  'legacy professional Sunday is restored from the immutable snapshot'
);
SELECT is(
  (SELECT day_of_week FROM public.workouts WHERE id = 'f4700000-0000-4000-8000-000000000102'),
  6,
  'personal workout remains unchanged'
);
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.workouts'::regclass
      AND tgname = 'trg_enforce_trainer_workout_iso_schedule'
      AND tgenabled = 'O' AND NOT tgisinternal
  ),
  'ISO schedule trigger is enabled'
);
SET LOCAL ROLE postgres;
SELECT set_config('app.trainer_prescription_mutation', 'authorized', TRUE);
SELECT throws_ok(
  $$UPDATE public.workouts SET day_of_week = 6 WHERE id = 'f4700000-0000-4000-8000-000000000101'$$,
  'P0001', 'TRAINER_PRESCRIPTION_SCHEDULE_MISMATCH',
  'trusted maintenance cannot persist a professional day that disagrees with its snapshot'
);
SELECT lives_ok(
  $$UPDATE public.workouts SET day_of_week = 7 WHERE id = 'f4700000-0000-4000-8000-000000000101'$$,
  'exact ISO schedule remains writable by an authorized trusted session'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 9: Run the database suite green**

After completing the ordering and applying 049, run:

```powershell
pnpm test:db:trainers
```

Expected: all 043, 044, 049, audit, authorization, race, continuity, and rerun checks pass; the banner reports `040-049`.

- [ ] **Step 10: Run final-order/static contracts green**

```powershell
pnpm vitest run src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts src/lib/coaching/__tests__/trainerSecurityMigration.test.ts src/lib/coaching/__tests__/trainerIsoWeekdayMigration.test.ts
```

Expected: all three files pass. Keep the existing 045 migration test unchanged:
it proves the historical 045 marker, while 049 owns the final marker.

- [ ] **Step 11: Commit the production-faithful regression suite**

```powershell
git add -- scripts/test-trainer-programming-db.mjs supabase/tests/043_trainer_programming_test.sql supabase/tests/044_trainer_insights_test.sql supabase/tests/049_trainer_iso_weekday_repair_test.sql src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts
git commit -m "test(trainer): cover ISO weekday repair"
```

---

### Task 3: Deployment and operator documentation

**Files:**
- Modify: `README.md:111`
- Modify: `docs/operations/trainer-marketplace-runbook.md:83`
- Modify: `docs/operations/trainer-marketplace-runbook.md:117`
- Modify: `docs/operations/trainer-marketplace-runbook.md:237`
- Modify: `docs/operations/trainer-pilot-checklist.md:5`

**Interfaces:**
- Consumes: marker `49`, migration order, error codes, and postcondition query from Tasks 1–3.
- Produces: operator-visible deploy gate `040–049`, preflight `49`, divergence count `0`, and forward-only rollback.

- [ ] **Step 1: Update the root migration inventory**

Extend the `README.md` ordered migration list from 039 through:

```text
040_trainer_foundations.sql
041_trainer_verification.sql
042_trainer_relationships.sql
043_trainer_programming.sql
044_trainer_insights.sql
045_trainer_hardening.sql
046_release_session_authorization.sql
047_product_notification_preferences_insert.sql
048_profile_weight_measurement_sync.sql
049_trainer_iso_weekday_repair.sql
```

State that database deploy precedes the compatible app deploy and that 049 must remain after any reapplication of 043/045.

- [ ] **Step 2: Update the runbook order and preflight**

Rename the section to `Orden de migración 040–049`, list 046/047/048/049, and change every final list/marker reference to 049 where it means current deployed state.

Add this privileged, count-only audit after `trainer_security_preflight()`:

```sql
SELECT count(*) AS iso_weekday_divergences
FROM public.workout_plans plan
JOIN public.trainer_assignment_versions version
  ON version.id = plan.trainer_assignment_version_id
 AND version.materialized_plan_id = plan.id
CROSS JOIN LATERAL jsonb_array_elements(version.snapshot->'workouts') AS prescribed(value)
JOIN public.workouts workout
  ON workout.plan_id = plan.id
 AND workout.order_in_plan = (prescribed.value->>'orderInPlan')::INTEGER
WHERE plan.source_type = 'trainer_assigned'
  AND workout.day_of_week IS DISTINCT FROM (prescribed.value->>'dayOfWeek')::INTEGER;
```

Document exact expected results:

```text
trainer_security_preflight = 49
iso_weekday_divergences = 0
```

Add Monday/Sunday proposal smoke steps, the pause-publication procedure, and the rule that rollback keeps migrations through 049/data and fixes forward. Never restore the defective subtraction.

- [ ] **Step 3: Update the pilot gate**

Replace all current-state references with:

```text
migraciones 040–049
trainer_security_preflight() = 49
divergencias ISO profesionales = 0
```

Add a checklist item requiring a synthetic Monday/Sunday proposal and revision before invitations resume.

- [ ] **Step 4: Verify documentation consistency**

```powershell
rg -n "040.?045|preflight 45|resultado válido es `45`|conservar datos/migraciones 040.?045" README.md docs/operations/trainer-marketplace-runbook.md docs/operations/trainer-pilot-checklist.md
git diff --check -- README.md docs/operations/trainer-marketplace-runbook.md docs/operations/trainer-pilot-checklist.md
```

Expected: no stale current-state references; historical statements may remain only when explicitly labeled historical. Diff check exits `0`.

- [ ] **Step 5: Commit the operator documentation**

```powershell
git add -- README.md docs/operations/trainer-marketplace-runbook.md docs/operations/trainer-pilot-checklist.md
git commit -m "docs(trainer): document weekday repair rollout"
```

---

### Task 4: Full verification and review gate

**Files:**
- Review all files changed in Tasks 1–3.
- Do not modify unrelated untracked documents.

**Interfaces:**
- Consumes: completed migration, regression suite, contracts, and documentation.
- Produces: fresh verification evidence and a review-ready branch.

- [ ] **Step 1: Run focused static and database verification**

```powershell
pnpm vitest run src/lib/coaching/__tests__/trainerIsoWeekdayMigration.test.ts src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts src/lib/coaching/__tests__/trainerSecurityMigration.test.ts
pnpm test:db:trainers
```

Expected: zero failed Vitest assertions; Docker banner confirms migrations 040–049 behavior/rerunnability.

- [ ] **Step 2: Run repository-wide verification serially**

```powershell
pnpm test -- --reporter=dot
pnpm type-check
pnpm lint
git diff --check
```

Expected: all commands exit `0`. Record exact test file/test counts and database suite result; do not reuse evidence from before the implementation.

- [ ] **Step 3: Audit the final diff against the spec**

```powershell
git diff 1d7b049..HEAD -- supabase/migrations/049_trainer_iso_weekday_repair.sql scripts/test-trainer-programming-db.mjs supabase/tests/043_trainer_programming_test.sql supabase/tests/044_trainer_insights_test.sql supabase/tests/049_trainer_iso_weekday_repair_test.sql src/lib/coaching/__tests__/trainerIsoWeekdayMigration.test.ts src/lib/coaching/__tests__/trainerMigrationRerunContract.test.ts README.md docs/operations/trainer-marketplace-runbook.md docs/operations/trainer-pilot-checklist.md
git status --short
```

Confirm manually:

- only four legacy expressions changed in copied routine bodies;
- no `- 1` remains in the final 049 weekday mappings;
- backfill predicate cannot reach personal plans;
- failed preflight proves rollback, not just error text;
- 049 is last after every historical rerun;
- no snapshots/audits/history are updated;
- only the pre-existing unrelated documents remain untracked.

- [ ] **Step 4: Request code review before integration**

Use `superpowers:requesting-code-review` with the design, this plan, commit list, and fresh verification evidence. Address only findings that reproduce or contradict a stated invariant; rerun the affected focal command after every correction.

- [ ] **Step 5: Create a final correction commit only if review changes files**

Stage only the exact paths shown by `git diff --name-only 1d7b049..HEAD` that
the review correction actually modified, verify them with
`git diff --cached --name-only`, and run:

```powershell
git commit -m "fix(trainer): address weekday repair review"
```

If review produces no file changes, do not stage anything and do not create an
empty commit.
