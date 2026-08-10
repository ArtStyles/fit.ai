import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrations = [40, 41, 42, 43, 44, 45].map(number => readFileSync(
  new URL(`../../../../supabase/migrations/0${number}_trainer_${({
    40: 'foundations',
    41: 'verification',
    42: 'relationships',
    43: 'programming',
    44: 'insights',
    45: 'hardening',
  } as const)[number as 40 | 41 | 42 | 43 | 44 | 45]}.sql`, import.meta.url),
  'utf8',
))

const sql = migrations.join('\n')
const hardening = migrations.at(-1)!
const runner = readFileSync(new URL('../../../../scripts/test-trainer-programming-db.mjs', import.meta.url), 'utf8')
const runbook = readFileSync(new URL('../../../../docs/operations/trainer-marketplace-runbook.md', import.meta.url), 'utf8')

function functionBody(name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${escaped}\\([^]*?AS \\$\\$([^]*?)\\$\\$;`, 'i'))
  expect(match, `missing function ${name}`).not.toBeNull()
  return match![1]!
}

describe('trainer professional audit coverage', () => {
  it.each([
    ['transition_trainer_application', ['trainer_interview_scheduled', 'trainer_interview_outcome_recorded', "'trainer_application_' || v_target_status"]],
    ['create_coaching_request', ["'coaching_request'", "'created'"]],
    ['cancel_coaching_request', ["'coaching_request'", "'cancelled'"]],
    ['accept_coaching_request', ["'coaching_request'", "'accepted'", "'cancelled_after_acceptance'"]],
    ['decline_coaching_request', ["'coaching_request'", "'declined'"]],
    ['grant_body_measurements_consent', ["'body_measurements_consent_granted'"]],
    ['revoke_body_measurements_consent', ["'body_measurements_consent_revoked'"]],
    ['revoke_training_profile_consent', ["'training_profile_consent_revoked'"]],
    ['end_coaching_relationship', ["'coaching_relationship'", "'ended'"]],
    ['resume_paused_coaching_relationship', ["'coaching_relationship'", "'resumed'"]],
    ['suspend_account_and_professional', ["'paused_due_to_account_suspension'", "'suspended'"]],
    ['reinstate_trainer_profile', ["'trainer_profile'", "'reinstated'"]],
    ['propose_trainer_assignment', ["'trainer_plan_assignment'", "'proposed'"]],
    ['accept_trainer_assignment', ["'trainer_plan_assignment'", "'accepted'"]],
    ['publish_trainer_assignment_revision', ["'trainer_plan_assignment'", "'revision_published'"]],
  ] as const)('keeps %s transitions inside the same transaction as their audit event', (name, fragments) => {
    const body = functionBody(name)
    expect(body).toContain('professional_audit_logs')
    for (const fragment of fragments) expect(body).toContain(fragment)
  })

  it('audits applicant submission/withdrawal without copying public notes or duplicating admin decisions', () => {
    const body = functionBody('audit_applicant_trainer_application_event')
    expect(body).toContain("NEW.actor_role = 'applicant'")
    expect(body).toContain('NEW.actor_user_id = auth.uid()')
    expect(body).toContain("'application_' || NEW.to_status")
    expect(body).not.toMatch(/public_note|internal_note/i)
    expect(hardening).toMatch(/AFTER INSERT ON public\.trainer_application_events[\s\S]+audit_applicant_trainer_application_event/i)
    const draftBody = functionBody('audit_trainer_application_draft_change')
    expect(draftBody).toContain("NEW.status NOT IN ('draft', 'changes_requested')")
    expect(draftBody).toContain("'application_draft_saved'")
    expect(draftBody).not.toMatch(/bio|contact|availability|photo|specialt|modalit/i)
  })

  it('audits trainer-owned profile, service and complete template CRUD from one authenticated source', () => {
    const body = functionBody('audit_trainer_owned_change')
    for (const table of [
      'trainer_profiles',
      'trainer_service_offerings',
      'trainer_program_templates',
      'trainer_template_workouts',
      'trainer_template_exercises',
      'trainer_application_credentials',
      'trainer_credential_storage_cleanup',
    ]) {
      expect(body).toContain(`'${table}'`)
      expect(hardening).toMatch(new RegExp(`ON public\\.${table}[\\s\\S]+audit_trainer_owned_change`, 'i'))
    }
    expect(body).toContain("auth.role() <> 'authenticated'")
    expect(body).not.toMatch(/bio|description|notes|professional_name|storage_path|external_url/i)
  })

  it('adds the missing relationship and initial training-profile consent evidence exactly once', () => {
    const body = functionBody('audit_coaching_materialization')
    expect(body).toContain("TG_TABLE_NAME = 'coaching_relationships'")
    expect(body).toContain("TG_TABLE_NAME = 'coaching_consents'")
    expect(body).toContain("NEW.scope = 'training_profile'")
    expect(body).toContain("'relationship_created'")
    expect(body).toContain("'training_profile_consent_granted'")
    expect(hardening.match(/EXECUTE FUNCTION public\.audit_coaching_materialization\(\)/gi)).toHaveLength(2)
  })

  it('records assignment freezing as a distinct side effect without duplicating proposal or revision events', () => {
    const body = functionBody('audit_trainer_assignment_freeze')
    expect(body).toContain("OLD.status IS DISTINCT FROM 'frozen'")
    expect(body).toContain("NEW.status = 'frozen'")
    expect(body).toContain("'assignment_frozen'")
    expect(hardening).toMatch(/AFTER UPDATE ON public\.trainer_plan_assignments[\s\S]+audit_trainer_assignment_freeze/i)
  })

  it('makes professional evidence append-only without a hidden retention or E2E deletion bypass', () => {
    const body = functionBody('reject_professional_audit_log_mutation')
    expect(body).toContain('PROFESSIONAL_AUDIT_APPEND_ONLY')
    expect(hardening).toMatch(/BEFORE UPDATE OR DELETE ON public\.professional_audit_logs[\s\S]+reject_professional_audit_log_mutation/i)
    expect(hardening).toMatch(/BEFORE TRUNCATE ON public\.professional_audit_logs[\s\S]+reject_professional_audit_log_mutation/i)
    expect(hardening).toMatch(/REVOKE ALL ON TABLE public\.professional_audit_logs FROM service_role/i)
    expect(hardening).toMatch(/GRANT SELECT, INSERT ON TABLE public\.professional_audit_logs TO service_role/i)
    expect(functionBody('cleanup_trainer_security_e2e_fixture')).not.toMatch(/DELETE FROM public\.professional_audit_logs/i)
    expect(hardening).not.toMatch(/audit_retention|audit_bypass|professional_audit_mutation/i)
  })

  it('sanitizes legacy audit metadata before storage and runs a behavioral DB contract', () => {
    const body = functionBody('sanitize_professional_audit_log_insert')
    const metadataBody = functionBody('sanitize_professional_audit_metadata')
    for (const key of ['reason', 'change_summary', 'email', 'phone', 'credential', 'storage', 'notes', 'measurement']) {
      expect(metadataBody).toContain(`'${key}'`)
    }
    expect(hardening).toMatch(/BEFORE INSERT ON public\.professional_audit_logs[\s\S]+sanitize_professional_audit_log_insert/i)
    expect(hardening).toMatch(/UPDATE public\.professional_audit_logs[\s\S]+sanitize_professional_audit_metadata\(entity_type, action, metadata\)/i)
    expect(body).toMatch(/sanitize_professional_audit_metadata\(\s*NEW\.entity_type,\s*NEW\.action,\s*NEW\.metadata\s*\)/i)
    expect(body).toContain('is_professional_audit_event_allowed')
    expect(body).toContain('PROFESSIONAL_AUDIT_EVENT_INVALID')
    expect(runner).toContain("trainer_audit_test.sql")
    expect(runner).toContain('seeding pre-045 professional audit evidence')
    expect(runner).toContain('running trainer append-only audit behavior suite')
  })

  it('allowlists automatic cancellation and closes metadata to each event schema', () => {
    const eventDomainBody = functionBody('is_professional_audit_event_allowed')
    expect(eventDomainBody).toContain("'cancelled_after_acceptance'")
    const metadataBody = functionBody('sanitize_professional_audit_metadata')
    expect(hardening).toMatch(/FUNCTION public\.sanitize_professional_audit_metadata\(\s*p_entity_type TEXT,\s*p_action TEXT,\s*p_metadata JSONB\s*\)/i)
    expect(metadataBody).toContain("p_entity_type = 'coaching_request' AND p_action = 'accepted'")
    expect(metadataBody).toContain("p_entity_type = 'trainer_application'")
    expect(metadataBody).toContain('v_allowed_keys')
    expect(metadataBody).toContain("WHEN 'trainer_application_approved' THEN 'approved'")
    expect(metadataBody).toContain("p_action = 'training_profile_consent_granted'")
    expect(metadataBody).toContain("v_safe := v_safe - 'toStatus'")
    expect(metadataBody).toContain("v_safe := v_safe - 'text_version' - 'scope'")
  })

  it('records admin-approved profile materialization once and classifies credential cleanup transitions', () => {
    const applicationEventBody = functionBody('audit_applicant_trainer_application_event')
    expect(applicationEventBody).toContain("NEW.actor_role = 'admin'")
    expect(applicationEventBody).toContain("NEW.to_status = 'approved'")
    expect(applicationEventBody).toContain('admin_profile.is_admin = TRUE')
    expect(applicationEventBody).toContain("profile.source_application_id = NEW.application_id")
    expect(applicationEventBody).toContain("v_application_kind = 'initial'")
    const body = functionBody('audit_trainer_owned_change')
    expect(body).toContain("'credential_removal_retried'")
    expect(body).toContain("v_old ->> 'attempt_count' IS DISTINCT FROM v_row ->> 'attempt_count'")
    expect(body).toContain("v_old ->> 'last_error' IS DISTINCT FROM v_row ->> 'last_error'")
  })

  it('keeps database secrets out of backup argv and encrypts the dump stream explicitly', () => {
    expect(runbook).not.toMatch(/\b(?:DATABASE_URL|RESTORE_VERIFY_DATABASE_URL)\b/)
    expect(runbook).toContain('PGSERVICEFILE')
    expect(runbook).toContain('PGPASSFILE')
    expect(runbook).toContain('age --encrypt')
    expect(runbook).toContain('age --decrypt')
    expect(runbook).toContain('el formato custom comprime, pero no cifra por sí solo')
    expect(runbook).not.toMatch(/pg_dump[^\n]+\$(?:DATABASE_URL|RESTORE_VERIFY_DATABASE_URL)/)
    expect(runbook).not.toMatch(/pg_restore[^\n]+\$(?:DATABASE_URL|RESTORE_VERIFY_DATABASE_URL)/)
  })
})
