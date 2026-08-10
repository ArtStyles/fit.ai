BEGIN;
SELECT plan(40);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('ad000000-0000-4000-8000-000000000001', 'audit-trainer@example.test', '{}'::jsonb),
  ('ad000000-0000-4000-8000-000000000002', 'audit-admin@example.test', '{}'::jsonb),
  ('ad000000-0000-4000-8000-000000000003', 'audit-client@example.test', '{}'::jsonb),
  ('ad000000-0000-4000-8000-000000000004', 'audit-trainer-b@example.test', '{}'::jsonb);
INSERT INTO public.profiles (id, onboarding_done, account_status, is_admin) VALUES
  ('ad000000-0000-4000-8000-000000000001', TRUE, 'active', FALSE),
  ('ad000000-0000-4000-8000-000000000002', TRUE, 'active', TRUE),
  ('ad000000-0000-4000-8000-000000000003', TRUE, 'active', FALSE),
  ('ad000000-0000-4000-8000-000000000004', TRUE, 'active', FALSE);

INSERT INTO public.professional_audit_logs (
  id, actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
) VALUES (
  'ad100000-0000-4000-8000-000000000001',
  'ad000000-0000-4000-8000-000000000001',
  'ad000000-0000-4000-8000-000000000001',
  'trainer_profile',
  'ad000000-0000-4000-8000-000000000001',
  'profile_updated',
  '{}'::jsonb
);

SELECT set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE public.professional_audit_logs SET action = 'forged' WHERE id = 'ad100000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'authenticated trainer cannot update professional audit evidence'
);
SELECT throws_ok(
  $$DELETE FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'authenticated trainer cannot delete professional audit evidence'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE public.professional_audit_logs SET action = 'admin_forged' WHERE id = 'ad100000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'authenticated administrator cannot update professional audit evidence'
);
SELECT throws_ok(
  $$DELETE FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'authenticated administrator cannot delete professional audit evidence'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'service_role', true);
SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$UPDATE public.professional_audit_logs SET action = 'service_forged' WHERE id = 'ad100000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'service role cannot update professional audit evidence directly'
);
SELECT throws_ok(
  $$DELETE FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'service role cannot delete professional audit evidence directly'
);
SELECT lives_ok(
  $$INSERT INTO public.professional_audit_logs (
      id, actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
    ) VALUES (
      'ad100000-0000-4000-8000-000000000002',
      'ad000000-0000-4000-8000-000000000002',
      'ad000000-0000-4000-8000-000000000001',
      'trainer_application',
      'ad200000-0000-4000-8000-000000000001',
      'trainer_application_approved',
      jsonb_build_object(
        'fromStatus', 'submitted',
        'toStatus', 'rejected',
        'scope', 'arbitrary_private_token',
        'service_id', 'ad300000-0000-4000-8000-000000000001',
        'reason', 'private free reason',
        'change_summary', 'private note',
        'Email', 'private@example.test',
        'payload', jsonb_build_object('phone', '+5355555555')
      )
    )$$,
  'service role can still append legitimate audit evidence'
);
SELECT throws_ok(
  $$INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action
    ) VALUES (
      'ad000000-0000-4000-8000-000000000002',
      'ad000000-0000-4000-8000-000000000001',
      'trainer_profile',
      'ad400000-0000-4000-8000-000000000001',
      'private@example.test'
    )$$,
  '22023', 'PROFESSIONAL_AUDIT_EVENT_INVALID',
  'service role cannot smuggle private text through audit action'
);
SELECT throws_ok(
  $$INSERT INTO public.professional_audit_logs (
      actor_user_id, subject_user_id, entity_type, entity_id, action
    ) VALUES (
      'ad000000-0000-4000-8000-000000000002',
      'ad000000-0000-4000-8000-000000000001',
      'https://storage.example.test/private/path',
      'ad400000-0000-4000-8000-000000000002',
      'profile_updated'
    )$$,
  '22023', 'PROFESSIONAL_AUDIT_EVENT_INVALID',
  'service role cannot smuggle private text through audit entity type'
);
INSERT INTO public.professional_audit_logs (
  id, actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
) VALUES
  (
    'ad100000-0000-4000-8000-000000000003',
    'ad000000-0000-4000-8000-000000000002',
    'ad000000-0000-4000-8000-000000000001',
    'trainer_application',
    'ad200000-0000-4000-8000-000000000003',
    'trainer_application_approved',
    jsonb_build_object('fromStatus', 'under_review', 'toStatus', 'approved')
  ),
  (
    'ad100000-0000-4000-8000-000000000004',
    'ad000000-0000-4000-8000-000000000002',
    'ad000000-0000-4000-8000-000000000001',
    'coaching_relationship',
    'ad200000-0000-4000-8000-000000000004',
    'training_profile_consent_granted',
    jsonb_build_object('text_version', 'body-measurements-v1', 'scope', 'body_measurements')
  ),
  (
    'ad100000-0000-4000-8000-000000000005',
    'ad000000-0000-4000-8000-000000000002',
    'ad000000-0000-4000-8000-000000000001',
    'coaching_relationship',
    'ad200000-0000-4000-8000-000000000005',
    'training_profile_consent_granted',
    jsonb_build_object('text_version', 'training-profile-v1', 'scope', 'training_profile')
  ),
  (
    'ad100000-0000-4000-8000-000000000006',
    'ad000000-0000-4000-8000-000000000002',
    'ad000000-0000-4000-8000-000000000001',
    'coaching_relationship',
    'ad200000-0000-4000-8000-000000000006',
    'body_measurements_consent_granted',
    jsonb_build_object('text_version', 'training-profile-v1', 'scope', 'training_profile')
  ),
  (
    'ad100000-0000-4000-8000-000000000007',
    'ad000000-0000-4000-8000-000000000002',
    'ad000000-0000-4000-8000-000000000001',
    'coaching_relationship',
    'ad200000-0000-4000-8000-000000000007',
    'body_measurements_consent_granted',
    jsonb_build_object('text_version', 'body-measurements-v1', 'scope', 'body_measurements')
  );
RESET ROLE;

SELECT is(
  (SELECT metadata FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000002'),
  '{"fromStatus":"submitted"}'::jsonb,
  'audit insert strips scalar keys that belong to another event schema'
);
SELECT is(
  (SELECT metadata FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000003'),
  '{"fromStatus":"under_review","toStatus":"approved"}'::jsonb,
  'application evidence retains status values consistent with its action'
);
SELECT is(
  (SELECT metadata FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000004'),
  '{}'::jsonb,
  'training-profile consent strips body-measurement version and scope values'
);
SELECT is(
  (SELECT metadata FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000005'),
  '{"scope":"training_profile","text_version":"training-profile-v1"}'::jsonb,
  'training-profile consent retains its exact version and scope values'
);
SELECT is(
  (SELECT metadata FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000006'),
  '{}'::jsonb,
  'body-measurement consent strips a training-profile version and scope'
);
SELECT is(
  (SELECT metadata FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000007'),
  '{"text_version":"body-measurements-v1"}'::jsonb,
  'body-measurement consent retains only its exact version and never a scope key'
);
SELECT is(
  (SELECT metadata FROM public.professional_audit_logs WHERE id = 'ad900000-0000-4000-8000-000000000001'),
  '{"idempotency_key":"ad900000-0000-4000-8000-000000000031"}'::jsonb,
  '045 redacts sensitive metadata already stored by earlier migrations'
);
SELECT is(
  (SELECT jsonb_build_object('entity_type', entity_type, 'action', action)
   FROM public.professional_audit_logs WHERE id = 'ad900000-0000-4000-8000-000000000002'),
  '{"entity_type":"professional_audit","action":"legacy_event_redacted"}'::jsonb,
  '045 replaces legacy non-domain event text before evidence becomes immutable'
);
SELECT is(
  (SELECT action FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000001'),
  'profile_updated',
  'denied mutations preserve the original evidence'
);

SELECT throws_ok(
  $$UPDATE public.professional_audit_logs SET action = 'owner_forged' WHERE id = 'ad100000-0000-4000-8000-000000000001'$$,
  '55000', 'PROFESSIONAL_AUDIT_APPEND_ONLY',
  'table owner is still stopped by the immutable-row trigger on update'
);
SELECT throws_ok(
  $$DELETE FROM public.professional_audit_logs WHERE id = 'ad100000-0000-4000-8000-000000000001'$$,
  '55000', 'PROFESSIONAL_AUDIT_APPEND_ONLY',
  'table owner is still stopped by the immutable-row trigger on delete'
);

SELECT ok(
  has_table_privilege('service_role', 'public.professional_audit_logs', 'INSERT'),
  'service role retains append privilege'
);
SELECT ok(
  has_table_privilege('service_role', 'public.professional_audit_logs', 'SELECT'),
  'service role retains least-privilege inspection'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.professional_audit_logs', 'UPDATE'),
  'service role has no update grant'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.professional_audit_logs', 'DELETE'),
  'service role has no delete grant'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.professional_audit_logs', 'TRUNCATE'),
  'service role has no truncate grant'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.professional_audit_logs', 'TRIGGER'),
  'service role has no trigger grant'
);
SELECT ok(
  NOT has_table_privilege('service_role', 'public.professional_audit_logs', 'REFERENCES'),
  'service role has no references grant'
);
SELECT is(
  (SELECT array_agg(grant_row.privilege_type::TEXT ORDER BY grant_row.privilege_type::TEXT)
   FROM information_schema.role_table_grants grant_row
   WHERE grant_row.grantee = 'service_role'
     AND grant_row.table_schema = 'public'
     AND grant_row.table_name = 'professional_audit_logs'),
  ARRAY['INSERT', 'SELECT']::TEXT[],
  'service role professional audit ACL is exactly append and inspect'
);
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.professional_audit_logs'::regclass),
  'audit evidence keeps enabled and forced RLS'
);
SELECT is(
  (SELECT proconfig FROM pg_proc WHERE oid = 'public.reject_professional_audit_log_mutation()'::regprocedure),
  ARRAY['search_path=public, pg_temp']::text[],
  'append-only trigger function pins a safe search_path'
);
SELECT is(
  (SELECT proconfig FROM pg_proc WHERE oid = 'public.sanitize_professional_audit_log_insert()'::regprocedure),
  ARRAY['search_path=public, pg_temp']::text[],
  'metadata sanitizer pins a safe search_path'
);
SELECT is(
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.professional_audit_logs'::regclass AND NOT tgisinternal),
  3::bigint,
  'audit table has one insert sanitizer plus row and truncate immutability guards'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE id IN (
    'ad100000-0000-4000-8000-000000000001',
    'ad100000-0000-4000-8000-000000000002'
  )),
  2::bigint,
  'all committed-style evidence remains present after mutation attempts'
);
SELECT ok(
  has_function_privilege('service_role', 'public.cleanup_trainer_security_e2e_fixture(text,uuid[])', 'EXECUTE'),
  'E2E cleanup remains callable only through its scoped server boundary'
);

INSERT INTO public.trainer_applications (
  id, user_id, status, professional_name, bio, experience_summary
) VALUES (
  'ad500000-0000-4000-8000-000000000001',
  'ad000000-0000-4000-8000-000000000001',
  'approved',
  'Approved audit trainer',
  'Approved profile',
  'Reviewed evidence'
);
SELECT set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
INSERT INTO public.trainer_profiles (
  id, user_id, source_application_id, slug, professional_name, bio, experience_summary
) VALUES (
  'ad500000-0000-4000-8000-000000000002',
  'ad000000-0000-4000-8000-000000000001',
  'ad500000-0000-4000-8000-000000000001',
  'approved-audit-trainer',
  'Approved audit trainer',
  'Approved profile',
  'Reviewed evidence'
);
INSERT INTO public.trainer_application_events (
  application_id, from_status, to_status, actor_user_id, actor_role
) VALUES (
  'ad500000-0000-4000-8000-000000000001',
  'under_review',
  'approved',
  'ad000000-0000-4000-8000-000000000002',
  'admin'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs
   WHERE entity_type = 'trainer_profile'
     AND entity_id = 'ad500000-0000-4000-8000-000000000002'
     AND action = 'profile_created'
     AND actor_user_id = 'ad000000-0000-4000-8000-000000000002'
     AND subject_user_id = 'ad000000-0000-4000-8000-000000000001'),
  1::bigint,
  'administrative approval creates exactly one profile evidence event'
);

SELECT set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000001', true);
INSERT INTO public.trainer_credential_storage_cleanup (
  id, user_id, application_id, credential_id, storage_path, reason
) VALUES (
  'ad600000-0000-4000-8000-000000000001',
  'ad000000-0000-4000-8000-000000000001',
  'ad500000-0000-4000-8000-000000000001',
  'ad600000-0000-4000-8000-000000000002',
  'ad000000-0000-4000-8000-000000000001/ad500000-0000-4000-8000-000000000001/ad600000-0000-4000-8000-000000000002.pdf',
  'user_removal'
);
UPDATE public.trainer_credential_storage_cleanup
SET updated_at = clock_timestamp()
WHERE id = 'ad600000-0000-4000-8000-000000000001';
UPDATE public.trainer_credential_storage_cleanup
SET attempt_count = attempt_count + 1, last_error = 'private storage failure'
WHERE id = 'ad600000-0000-4000-8000-000000000001';
DELETE FROM public.trainer_credential_storage_cleanup
WHERE id = 'ad600000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT jsonb_build_object(
    'prepared', count(*) FILTER (WHERE action = 'credential_removal_prepared'),
    'retried', count(*) FILTER (WHERE action = 'credential_removal_retried'),
    'failed', count(*) FILTER (WHERE action = 'credential_cleanup_failed'),
    'removed', count(*) FILTER (WHERE action = 'credential_removed')
  ) FROM public.professional_audit_logs
  WHERE entity_type = 'trainer_application_credential'
    AND entity_id = 'ad600000-0000-4000-8000-000000000002'),
  '{"prepared":1,"retried":1,"failed":1,"removed":1}'::jsonb,
  'credential cleanup distinguishes preparation, retry, failure, and success without error text'
);

INSERT INTO public.trainer_applications (
  id, user_id, status, professional_name, bio, experience_summary
) VALUES (
  'ad700000-0000-4000-8000-000000000001',
  'ad000000-0000-4000-8000-000000000004',
  'approved',
  'Second audit trainer',
  'Second approved profile',
  'Second reviewed evidence'
);
INSERT INTO public.trainer_profiles (
  id, user_id, source_application_id, slug, professional_name, bio, experience_summary
) VALUES (
  'ad700000-0000-4000-8000-000000000002',
  'ad000000-0000-4000-8000-000000000004',
  'ad700000-0000-4000-8000-000000000001',
  'second-audit-trainer',
  'Second audit trainer',
  'Second approved profile',
  'Second reviewed evidence'
);
INSERT INTO public.trainer_service_offerings (
  id, trainer_profile_id, name, modality, duration_minutes
) VALUES
  (
    'ad700000-0000-4000-8000-000000000003',
    'ad500000-0000-4000-8000-000000000002',
    'First audit service',
    'online',
    60
  ),
  (
    'ad700000-0000-4000-8000-000000000004',
    'ad700000-0000-4000-8000-000000000002',
    'Second audit service',
    'online',
    60
  );
INSERT INTO public.coaching_requests (
  id, service_id, trainer_user_id, client_user_id, message,
  training_profile_consent_version, idempotency_key
) VALUES
  (
    'ad800000-0000-4000-8000-000000000001',
    'ad700000-0000-4000-8000-000000000003',
    'ad000000-0000-4000-8000-000000000001',
    'ad000000-0000-4000-8000-000000000003',
    'Open request to first trainer',
    'training-profile-v1',
    'ad810000-0000-4000-8000-000000000001'
  ),
  (
    'ad800000-0000-4000-8000-000000000002',
    'ad700000-0000-4000-8000-000000000004',
    'ad000000-0000-4000-8000-000000000004',
    'ad000000-0000-4000-8000-000000000003',
    'Open request to second trainer',
    'training-profile-v1',
    'ad810000-0000-4000-8000-000000000002'
  );
SELECT set_config('request.jwt.claim.sub', 'ad000000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.accept_coaching_request(
    'ad800000-0000-4000-8000-000000000001',
    'ad820000-0000-4000-8000-000000000001'
  )$$,
  'accepting one open request succeeds when another trainer request is pending'
);
RESET ROLE;
SELECT is(
  (SELECT status FROM public.coaching_requests
   WHERE id = 'ad800000-0000-4000-8000-000000000002'),
  'cancelled',
  'open acceptance cancels the other pending request atomically'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs
   WHERE entity_type = 'coaching_request'
     AND entity_id = 'ad800000-0000-4000-8000-000000000002'
     AND action = 'cancelled_after_acceptance'
     AND metadata = jsonb_build_object(
       'accepted_request_id', 'ad800000-0000-4000-8000-000000000001',
       'service_id', 'ad700000-0000-4000-8000-000000000004'
     )),
  1::bigint,
  'automatic cancellation keeps one exact domain audit event'
);

SELECT throws_ok(
  $$TRUNCATE TABLE public.professional_audit_logs$$,
  '55000', 'PROFESSIONAL_AUDIT_APPEND_ONLY',
  'table owner cannot truncate professional audit evidence'
);

SELECT * FROM finish();
ROLLBACK;
