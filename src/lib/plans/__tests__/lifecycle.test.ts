import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolvePlanGenerationLifecycle } from '../lifecycle'

const migration = readFileSync(
  new URL('../../../../supabase/migrations/037_atomic_plan_lifecycle.sql', import.meta.url),
  'utf8',
)
const databaseTypes = readFileSync(new URL('../../../types/database.ts', import.meta.url), 'utf8')
const generatePlanAction = readFileSync(new URL('../../../app/actions/generatePlan.ts', import.meta.url), 'utf8')
const planActions = readFileSync(new URL('../../../app/actions/plan.ts', import.meta.url), 'utf8')
const adjustPlanAction = readFileSync(new URL('../../../app/actions/adjustPlan.ts', import.meta.url), 'utf8')
const postActions = readFileSync(new URL('../../../app/actions/posts.ts', import.meta.url), 'utf8')
const adminActions = readFileSync(new URL('../../../app/actions/admin.ts', import.meta.url), 'utf8')
const actionNotice = readFileSync(new URL('../../../components/feedback/ActionNotice.tsx', import.meta.url), 'utf8')
const generateClient = readFileSync(
  new URL('../../../app/(app)/plans/generate/GeneratePlanClient.tsx', import.meta.url),
  'utf8',
)
const regenerateButton = readFileSync(
  new URL('../../../components/plan/PlanRegenerateButton.tsx', import.meta.url),
  'utf8',
)
const adjustButton = readFileSync(
  new URL('../../../components/plan/PlanAdjustButton.tsx', import.meta.url),
  'utf8',
)
const onboardingWizard = readFileSync(
  new URL('../../../app/onboarding/OnboardingWizard.tsx', import.meta.url),
  'utf8',
)

function sqlFunction(name: string): string {
  const match = migration.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]+?\\n\\$\\$;`,
    'i',
  ))
  expect(match, `${name} SQL function`).not.toBeNull()
  return match![0]
}

function actionFunction(source: string, name: string, nextName: string): string {
  const match = source.match(new RegExp(
    `export async function ${name}\\([\\s\\S]+?(?=export async function ${nextName}\\()`,
  ))
  expect(match, `${name} action`).not.toBeNull()
  return match![0]
}

describe('resolvePlanGenerationLifecycle', () => {
  it('requires the expected active parent for weekly regeneration', () => {
    expect(() => resolvePlanGenerationLifecycle('weekly_regeneration', null)).toThrow(
      'ACTIVE_PLAN_REQUIRED',
    )
  })

  it('requires the expected active parent for structured adjustment', () => {
    expect(() => resolvePlanGenerationLifecycle('plan_adjustment', null)).toThrow(
      'ACTIVE_PLAN_REQUIRED',
    )
  })

  it('inherits the active family and expected parent for a new version', () => {
    expect(resolvePlanGenerationLifecycle('weekly_regeneration', {
      id: 'plan-a1',
      familyId: 'family-a',
    })).toEqual({
      createsNewFamily: false,
      expectedParentPlanId: 'plan-a1',
      replacingFamilyId: 'family-a',
    })
  })

  it('creates a new family for initial generation', () => {
    expect(resolvePlanGenerationLifecycle('initial', null)).toEqual({
      createsNewFamily: true,
      expectedParentPlanId: null,
      replacingFamilyId: null,
    })
  })
})

describe('atomic plan lifecycle migration', () => {
  it('never physically deletes plan or completed-session evidence', () => {
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b/i)
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+(?:public\.)?(?:progress_logs|exercise_logs)/i)
  })

  it.each([
    'create_engine_plan_v2',
    'activate_plan_version',
    'retire_plan_family',
    'create_manual_plan_atomic',
    'clone_plan_from_post_atomic',
  ])('%s authenticates and serializes the user before changing active state', name => {
    const fn = sqlFunction(name)
    expect(fn).toMatch(/v_user_id\s+UUID\s*:=\s*auth\.uid\(\)/i)
    expect(fn).toMatch(/v_user_id\s+IS\s+NULL[\s\S]+RAISE EXCEPTION/i)
    expect(fn).toMatch(/pg_advisory_xact_lock\(hashtextextended\(v_user_id::TEXT,\s*0\)\)/i)
    expect(fn).toMatch(/user_id\s*=\s*v_user_id/i)
  })

  it('creates an engine version idempotently from the expected active parent', () => {
    const fn = sqlFunction('create_engine_plan_v2')

    expect(fn).toMatch(/p_expected_parent_plan_id\s+UUID/i)
    expect(fn).toMatch(/p_generation_request_id\s+UUID/i)
    expect(fn).toMatch(/generation_request_id\s*=\s*p_generation_request_id/i)
    expect(fn).toMatch(/PLAN_STALE_PARENT/i)
    expect(fn).toMatch(/parent_plan_id[\s\S]+p_expected_parent_plan_id/i)
    expect(fn).toMatch(/family_id[\s\S]+v_parent_plan\.family_id/i)
    expect(fn).toMatch(/SET\s+is_active\s*=\s*FALSE,\s*superseded_at\s*=\s*NOW\(\)/i)
    expect(fn).toMatch(/retired_at\s+IS\s+NULL[\s\S]+superseded_at\s+IS\s+NULL/i)
    expect(fn).toMatch(/subscription_tier[\s\S]+PLAN_FAMILY_LIMIT/i)
    expect(fn).toMatch(/record_plan_generation_success\(v_plan_id\)/i)
  })

  it('activates only an owned current family head', () => {
    const fn = sqlFunction('activate_plan_version')

    expect(fn).toMatch(/id\s*=\s*p_plan_id[\s\S]+user_id\s*=\s*v_user_id/i)
    expect(fn).toMatch(/retired_at\s+IS\s+NOT\s+NULL[\s\S]+PLAN_VERSION_RETIRED/i)
    expect(fn).toMatch(/superseded_at\s+IS\s+NOT\s+NULL[\s\S]+PLAN_VERSION_SUPERSEDED/i)
    expect(fn).toMatch(/SET\s+is_active\s*=\s*FALSE[\s\S]+SET\s+is_active\s*=\s*TRUE/i)
  })

  it('retires every owned family version and selects another current head', () => {
    const fn = sqlFunction('retire_plan_family')

    expect(fn).toMatch(/family_id\s*=\s*v_family_id[\s\S]+user_id\s*=\s*v_user_id/i)
    expect(fn).toMatch(/SET\s+retired_at\s*=\s*COALESCE\(retired_at,\s*NOW\(\)\),\s*is_active\s*=\s*FALSE/i)
    expect(fn).toMatch(/family_id\s*<>\s*v_family_id/i)
    expect(fn).toMatch(/retired_at\s+IS\s+NULL[\s\S]+superseded_at\s+IS\s+NULL/i)
  })

  it('creates a manual plan and all requested workouts in one function', () => {
    const fn = sqlFunction('create_manual_plan_atomic')

    expect(fn).toMatch(/p_workouts\s+JSONB/i)
    expect(fn).toMatch(/INSERT INTO (?:public\.)?workout_plans/i)
    expect(fn).toMatch(/jsonb_array_elements\(COALESCE\(p_workouts/i)
    expect(fn).toMatch(/INSERT INTO (?:public\.)?workouts/i)
    expect(fn).toMatch(/IF p_make_active THEN[\s\S]+is_active\s*=\s*FALSE[\s\S]+is_active\s*=\s*TRUE/i)
  })

  it('clones a visible post snapshot under the lifecycle lock in one transaction', () => {
    const fn = sqlFunction('clone_plan_from_post_atomic')
    const lock = fn.indexOf('pg_advisory_xact_lock')
    const familyCount = fn.indexOf('COUNT(DISTINCT family_id)')

    expect(fn).toMatch(/p_post_id\s+UUID/i)
    expect(fn).toMatch(/SECURITY\s+INVOKER/i)
    expect(fn).toMatch(/FROM (?:public\.)?posts[\s\S]+id\s*=\s*p_post_id/i)
    expect(fn).toMatch(/routine_snapshot\s+IS\s+NOT\s+NULL/i)
    expect(fn).toMatch(/INSERT INTO (?:public\.)?workout_plans/i)
    expect(fn).toMatch(/INSERT INTO (?:public\.)?workouts/i)
    expect(fn).toMatch(/INSERT INTO (?:public\.)?workout_exercises/i)
    expect(fn).toMatch(/source_type[\s\S]+'shared_post'/i)
    expect(fn).toMatch(/RETURN\s+v_plan_id/i)
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.clone_plan_from_post_atomic\(UUID\) TO authenticated/i,
    )
    expect(lock).toBeGreaterThan(0)
    expect(familyCount).toBeGreaterThan(lock)
  })

  it('enforces the free family invariant for direct and concurrent writes', () => {
    const fn = sqlFunction('enforce_plan_family_limit')
    const ownershipCheck = fn.indexOf('v_actor_id <> NEW.user_id')
    const lock = fn.indexOf('pg_advisory_xact_lock')
    const invalidActivation = fn.indexOf('IF NEW.is_active AND (')
    const retiredReturn = fn.indexOf('IF NEW.retired_at IS NOT NULL OR NEW.superseded_at IS NOT NULL')
    const familyCount = fn.indexOf('COUNT(DISTINCT family_id)')

    expect(fn).toMatch(/RETURNS\s+TRIGGER/i)
    expect(fn).toMatch(/SECURITY\s+DEFINER/i)
    expect(fn).toMatch(/v_actor_role[\s\S]+service_role/i)
    expect(fn).toMatch(/session_user[\s\S]+postgres[\s\S]+supabase_admin/i)
    expect(fn).toMatch(/subscription_tier/i)
    expect(fn).toMatch(/COUNT\(DISTINCT family_id\)/i)
    expect(fn).toMatch(/retired_at\s+IS\s+NULL/i)
    expect(fn).toMatch(/superseded_at\s+IS\s+NULL/i)
    expect(fn).toMatch(/family_id\s*=\s*NEW\.family_id/i)
    expect(fn).toMatch(/id\s*<>\s*NEW\.id/i)
    expect(fn).toMatch(/PLAN_FAMILY_LIMIT/i)
    expect(ownershipCheck).toBeGreaterThan(0)
    expect(ownershipCheck).toBeLessThan(lock)
    expect(lock).toBeGreaterThan(0)
    expect(invalidActivation).toBeGreaterThan(lock)
    expect(invalidActivation).toBeLessThan(retiredReturn)
    expect(fn.slice(invalidActivation, retiredReturn)).toContain('PLAN_VERSION_UNAVAILABLE')
    expect(retiredReturn).toBeGreaterThan(lock)
    expect(familyCount).toBeGreaterThan(lock)
    expect(migration).toMatch(
      /CREATE TRIGGER trg_enforce_plan_family_limit\s+BEFORE INSERT OR UPDATE OF user_id, family_id, retired_at, superseded_at, is_active\s+ON (?:public\.)?workout_plans/i,
    )
  })

  it('allows only trusted tier changes and serializes Pro to Free downgrades', () => {
    const fn = sqlFunction('enforce_subscription_tier_change')
    const unchangedTier = fn.indexOf('NEW.subscription_tier IS NOT DISTINCT FROM OLD.subscription_tier')
    const trustedContext = fn.indexOf("v_actor_role <> 'service_role'")
    const lock = fn.indexOf('pg_try_advisory_xact_lock')
    const downgrade = fn.indexOf("OLD.subscription_tier = 'pro'")
    const familyCount = fn.indexOf('COUNT(DISTINCT family_id)')

    expect(fn).toMatch(/RETURNS\s+TRIGGER/i)
    expect(fn).toMatch(/SECURITY\s+DEFINER/i)
    expect(fn).toMatch(/PLAN_SUBSCRIPTION_TIER_CHANGE_FORBIDDEN/i)
    expect(fn).toMatch(/PLAN_TIER_LOCK_BUSY_RETRY/i)
    expect(fn).toMatch(/session_user[\s\S]+postgres[\s\S]+supabase_admin/i)
    expect(fn).toMatch(/NEW\.subscription_tier\s*=\s*'free'/i)
    expect(fn).toMatch(/retired_at\s+IS\s+NULL[\s\S]+superseded_at\s+IS\s+NULL/i)
    expect(fn).toMatch(/PLAN_DOWNGRADE_FAMILY_LIMIT/i)
    expect(unchangedTier).toBeGreaterThan(0)
    expect(unchangedTier).toBeLessThan(trustedContext)
    expect(trustedContext).toBeGreaterThan(0)
    expect(trustedContext).toBeLessThan(lock)
    expect(lock).toBeLessThan(downgrade)
    expect(downgrade).toBeLessThan(familyCount)
    expect(migration).toMatch(
      /CREATE TRIGGER trg_00_guard_subscription_tier_request\s+BEFORE UPDATE OF subscription_tier ON (?:public\.)?profiles/i,
    )
    expect(migration).toMatch(
      /CREATE TRIGGER trg_zz_guard_subscription_tier_result\s+BEFORE UPDATE ON (?:public\.)?profiles/i,
    )
  })

  it('changes subscription tier through a trusted RPC that locks before the profile row', () => {
    const fn = sqlFunction('set_subscription_tier_atomic')
    const trustedContext = fn.indexOf("v_actor_role <> 'service_role'")
    const lock = fn.indexOf('pg_advisory_xact_lock')
    const profileUpdate = fn.indexOf('UPDATE profiles')

    expect(fn).toMatch(/p_user_id\s+UUID/i)
    expect(fn).toMatch(/p_subscription_tier\s+TEXT/i)
    expect(fn).toMatch(/PLAN_SUBSCRIPTION_TIER_CHANGE_FORBIDDEN/i)
    expect(fn).toMatch(/PLAN_DOWNGRADE_FAMILY_LIMIT/i)
    expect(fn).toMatch(/COUNT\(DISTINCT family_id\)/i)
    expect(fn).toMatch(/retired_at\s+IS\s+NULL[\s\S]+superseded_at\s+IS\s+NULL/i)
    expect(trustedContext).toBeGreaterThan(0)
    expect(trustedContext).toBeLessThan(lock)
    expect(lock).toBeLessThan(profileUpdate)
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.set_subscription_tier_atomic\(UUID, TEXT\) TO service_role/i,
    )
    expect(databaseTypes).toContain('set_subscription_tier_atomic:')
  })

  it('fails migration explicitly when preexisting free accounts exceed two families', () => {
    const workoutPlansLock = migration.indexOf('LOCK TABLE public.workout_plans IN SHARE ROW EXCLUSIVE MODE')
    const profilesLock = migration.indexOf('LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE')
    const auditStart = migration.indexOf('DO $plan_family_preexisting_check$')
    const auditEnd = migration.indexOf('$plan_family_preexisting_check$;', auditStart + 3)
    const audit = migration.slice(auditStart, auditEnd)

    expect(workoutPlansLock).toBeGreaterThan(0)
    expect(profilesLock).toBeGreaterThan(workoutPlansLock)
    expect(auditStart).toBeGreaterThan(profilesLock)
    expect(audit).toMatch(/subscription_tier\s*=\s*'free'/i)
    expect(audit).toMatch(/COUNT\(DISTINCT\s+wp\.family_id\)/i)
    expect(audit).toMatch(/wp\.retired_at\s+IS\s+NULL/i)
    expect(audit).toMatch(/wp\.superseded_at\s+IS\s+NULL/i)
    expect(audit).toMatch(/HAVING\s+COUNT\(DISTINCT\s+wp\.family_id\)\s*>\s*2/i)
    expect(audit).toMatch(/PLAN_PREEXISTING_FREE_FAMILY_LIMIT/i)
  })

  it('publishes exact generated RPC types', () => {
    for (const name of [
      'create_engine_plan_v2',
      'activate_plan_version',
      'retire_plan_family',
      'create_manual_plan_atomic',
      'clone_plan_from_post_atomic',
    ]) {
      expect(databaseTypes).toContain(`${name}:`)
    }
    expect(databaseTypes).toContain('p_expected_parent_plan_id: string | null')
    expect(databaseTypes).toContain('p_generation_request_id: string')
  })

  it('revokes the legacy generation RPC so authenticated callers cannot bypass v2', () => {
    expect(migration).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.create_engine_plan\(JSONB, JSONB, INTEGER, TEXT, UUID, JSONB\)\s+FROM authenticated/i,
    )
    expect(databaseTypes).not.toMatch(/\n\s+create_engine_plan:\s*\{/)
  })
})

describe('plan lifecycle application boundary', () => {
  it('persists engine plans through v2 with an expected parent and stable request id', () => {
    expect(generatePlanAction).toContain("'create_engine_plan_v2'")
    expect(generatePlanAction).toContain('p_expected_parent_plan_id: lifecycle.expectedParentPlanId')
    expect(generatePlanAction).toContain('p_generation_request_id: options.requestId')
    expect(generatePlanAction).toContain('activePlanError')
    expect(generatePlanAction).toContain('PLAN_STALE_PARENT')
    expect(generatePlanAction).not.toContain('pruneExcessPlansForFreeUser')
    expect(generatePlanAction).not.toContain('recordEvidenceGenerationSuccess')
  })

  it('keeps failed previews read-only', () => {
    const engineFailure = generatePlanAction.indexOf('if (!engineResult.success || !engineResult.plan)')
    const previewSuccess = generatePlanAction.indexOf('if (options.previewOnly)', engineFailure)
    const failureBranch = generatePlanAction.slice(engineFailure, previewSuccess)
    const readOnlyGuard = failureBranch.indexOf('if (!options.previewOnly)')
    const eventWrite = failureBranch.indexOf('await recordEvidenceGenerationFailure(')

    expect(engineFailure).toBeGreaterThan(0)
    expect(readOnlyGuard).toBeGreaterThan(0)
    expect(eventWrite).toBeGreaterThan(readOnlyGuard)
  })

  it('keeps a structured adjustment bound to the plan that was previewed', () => {
    expect(adjustPlanAction).toContain('expectedParentPlanId: plan.id')
    expect(generatePlanAction).toContain('options.expectedParentPlanId')
  })

  it('returns a committed request before revalidating active parent or family limits', () => {
    const generateStart = generatePlanAction.indexOf('export async function generatePlan')
    const existingLookup = generatePlanAction.indexOf('await loadExistingPlanGeneration(', generateStart)
    const activeLookup = generatePlanAction.indexOf('activePlanError', generateStart)
    const entitlementLookup = generatePlanAction.indexOf('getPlanCreatePolicy(supabase', generateStart)
    const applyStart = adjustPlanAction.indexOf('export async function applyPlanAdjustment')
    const adjustmentReplay = adjustPlanAction.indexOf('findExistingPlanGeneration(requestId)', applyStart)
    const adjustmentParentLookup = adjustPlanAction.indexOf(
      'getOwnedActivePlan(supabase, user.id, planId)',
      applyStart,
    )

    expect(existingLookup).toBeGreaterThan(0)
    expect(existingLookup).toBeLessThan(activeLookup)
    expect(existingLookup).toBeLessThan(entitlementLookup)
    expect(generatePlanAction).toContain('generation_request_id')
    expect(generatePlanAction).toContain('generation_metadata')
    expect(adjustmentReplay).toBeGreaterThan(0)
    expect(adjustmentReplay).toBeLessThan(adjustmentParentLookup)
  })

  it('returns persisted metadata after the RPC wins or deduplicates a race', () => {
    const rpcCall = generatePlanAction.indexOf("'create_engine_plan_v2'")
    const persistedReload = generatePlanAction.indexOf('await loadExistingPlanGeneration(', rpcCall)

    expect(rpcCall).toBeGreaterThan(0)
    expect(persistedReload).toBeGreaterThan(rpcCall)
    expect(generatePlanAction).toContain('return persistedPlan')
  })

  it('never reports failure after the RPC has confirmed a committed plan id', () => {
    const rpcCall = generatePlanAction.indexOf("'create_engine_plan_v2'")
    const confirmedCommit = generatePlanAction.indexOf('if (rpcError || !newPlanId)', rpcCall)
    const fallback = generatePlanAction.indexOf('planId: newPlanId', confirmedCommit)

    expect(fallback).toBeGreaterThan(confirmedCommit)
    expect(generatePlanAction.slice(fallback)).not.toContain(
      "return { success: false, error: 'El plan se guardó",
    )
  })

  it('uses atomic RPCs for activation, retirement and manual creation', () => {
    const activate = actionFunction(planActions, 'activatePlan', 'createManualPlan')
    const createManual = actionFunction(planActions, 'createManualPlan', 'deletePlan')
    const retire = actionFunction(planActions, 'deletePlan', 'updatePlanSummary')

    expect(activate).toContain("'activate_plan_version'")
    expect(createManual).toContain("'create_manual_plan_atomic'")
    expect(retire).toContain("'retire_plan_family'")
    expect(activate).not.toContain(".from('workout_plans')")
    expect(createManual).not.toContain('.insert(')
    expect(retire).not.toContain('.delete()')
  })

  it('clones a post only through the atomic database boundary', () => {
    const clone = postActions.slice(postActions.indexOf('export async function clonePlanFromPost'))

    expect(clone).toContain("'clone_plan_from_post_atomic'")
    expect(clone).not.toContain(".from('workout_plans')")
    expect(clone).not.toContain(".from('workouts')")
    expect(clone).not.toContain(".from('workout_exercises')")
    expect(clone).not.toContain('getPlanCreatePolicy')
    expect(clone).not.toContain('.insert(')
    expect(clone).not.toContain('.delete()')
  })

  it('surfaces a blocked admin downgrade without hiding the database reason', () => {
    expect(adminActions).toContain("'set_subscription_tier_atomic'")
    expect(adminActions).not.toContain("from('profiles').update({ subscription_tier: tier })")
    expect(adminActions).toContain("error?.message?.includes('PLAN_DOWNGRADE_FAMILY_LIMIT')")
    expect(adminActions).toContain("redirect('/admin?error=admin_plan_downgrade_family_limit')")
    expect(adminActions).toContain("error?.message?.includes('PLAN_TIER_LOCK_BUSY_RETRY')")
    expect(adminActions).toContain("redirect('/admin?error=admin_plan_tier_busy')")
    expect(actionNotice).toContain('admin_plan_downgrade_family_limit:')
    expect(actionNotice).toContain('admin_plan_tier_busy:')
  })

  it('creates one operation id at every persistence UI boundary', () => {
    for (const source of [generateClient, regenerateButton, adjustButton, onboardingWizard]) {
      expect(source.match(/crypto\.randomUUID\(\)/g)).toHaveLength(1)
    }

    expect(generateClient).toContain("generatePlan({ mode: 'initial', requestId })")
    expect(regenerateButton).toContain("generatePlan({ mode: 'weekly_regeneration', requestId })")
    expect(adjustButton).toContain('applyPlanAdjustment(planId, previewIntent, requestId)')
    expect(onboardingWizard).toContain("generatePlan({ mode: 'initial', requestId })")
    expect(adjustPlanAction).toContain('requestId: string')
  })
})
