BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(42);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('57000000-0000-4000-8000-000000000001', 'decline-trainer@example.test', '{}'::JSONB),
  ('57000000-0000-4000-8000-000000000002', 'decline-owner@example.test', '{}'::JSONB),
  ('57000000-0000-4000-8000-000000000003', 'decline-foreign@example.test', '{}'::JSONB);

INSERT INTO public.profiles (id, full_name, onboarding_done, account_status) VALUES
  ('57000000-0000-4000-8000-000000000001', 'Decline trainer', TRUE, 'active'),
  ('57000000-0000-4000-8000-000000000002', 'Decline owner', TRUE, 'active'),
  ('57000000-0000-4000-8000-000000000003', 'Decline foreign client', TRUE, 'active');

INSERT INTO public.trainer_applications (id, user_id, status, decided_at) VALUES
  ('57000000-0000-4000-8000-000000000011', '57000000-0000-4000-8000-000000000001', 'approved', NOW());

INSERT INTO public.trainer_profiles (
  id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary
) VALUES (
  '57000000-0000-4000-8000-000000000021',
  '57000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000011',
  'decline-trainer',
  'active',
  'Decline trainer',
  'Bio',
  'Evidence'
);

INSERT INTO public.trainer_service_offerings (
  id, trainer_profile_id, name, modality, duration_minutes
) VALUES (
  '57000000-0000-4000-8000-000000000031',
  '57000000-0000-4000-8000-000000000021',
  'Decline service',
  'online',
  60
);

INSERT INTO public.coaching_relationships (
  id, service_id, trainer_user_id, client_user_id, status, ended_at, ended_by, end_reason
) VALUES
  (
    '57000000-0000-4000-8000-000000000041',
    '57000000-0000-4000-8000-000000000031',
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000002',
    'ended', NOW(), '57000000-0000-4000-8000-000000000002', 'Ended before proposal response'
  ),
  (
    '57000000-0000-4000-8000-000000000042',
    '57000000-0000-4000-8000-000000000031',
    '57000000-0000-4000-8000-000000000001',
    '57000000-0000-4000-8000-000000000003',
    'active', NULL, NULL, NULL
  );

SET CONSTRAINTS ALL DEFERRED;

INSERT INTO public.trainer_plan_assignments (
  id, relationship_id, trainer_user_id, client_user_id, status, accepted_at, active_version_id
) VALUES
  ('57000000-0000-4000-8000-000000000061', '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002', 'proposed', NULL, NULL),
  ('57000000-0000-4000-8000-000000000062', '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002', 'proposed', NULL, NULL),
  ('57000000-0000-4000-8000-000000000063', '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002', 'proposed', NULL, NULL),
  ('57000000-0000-4000-8000-000000000064', '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002', 'proposed', NULL, NULL),
  ('57000000-0000-4000-8000-000000000065', '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002', 'proposed', NULL, NULL),
  ('57000000-0000-4000-8000-000000000066', '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002', 'active', NOW(), '57000000-0000-4000-8000-000000000076'),
  ('57000000-0000-4000-8000-000000000067', '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002', 'frozen', NULL, NULL),
  ('57000000-0000-4000-8000-000000000068', '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002', 'cancelled', NULL, NULL),
  ('57000000-0000-4000-8000-000000000069', '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000002', 'proposed', NULL, NULL),
  ('57000000-0000-4000-8000-00000000006a', '57000000-0000-4000-8000-000000000042', '57000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000003', 'proposed', NULL, NULL);

INSERT INTO public.trainer_assignment_versions (
  id, assignment_id, version_number, snapshot, change_summary, status, materialized_plan_id
) VALUES
  ('57000000-0000-4000-8000-000000000071', '57000000-0000-4000-8000-000000000061', 1, '{"schemaVersion":1,"name":"Main","workouts":[]}'::JSONB, 'Main summary', 'proposed', '57000000-0000-4000-8000-000000000081'),
  ('57000000-0000-4000-8000-000000000072', '57000000-0000-4000-8000-000000000062', 1, '{"schemaVersion":1,"name":"Boundary","workouts":[]}'::JSONB, NULL, 'proposed', '57000000-0000-4000-8000-000000000082'),
  ('57000000-0000-4000-8000-000000000073', '57000000-0000-4000-8000-000000000063', 1, '{"schemaVersion":1,"name":"Blank","workouts":[]}'::JSONB, NULL, 'proposed', '57000000-0000-4000-8000-000000000083'),
  ('57000000-0000-4000-8000-000000000074', '57000000-0000-4000-8000-000000000064', 1, '{"schemaVersion":1,"name":"Invalid","workouts":[]}'::JSONB, NULL, 'proposed', '57000000-0000-4000-8000-000000000084'),
  ('57000000-0000-4000-8000-000000000075', '57000000-0000-4000-8000-000000000065', 1, '{"schemaVersion":1,"name":"Conflict","workouts":[]}'::JSONB, NULL, 'proposed', '57000000-0000-4000-8000-000000000085'),
  ('57000000-0000-4000-8000-000000000076', '57000000-0000-4000-8000-000000000066', 1, '{"schemaVersion":1,"name":"Active","workouts":[]}'::JSONB, NULL, 'active', '57000000-0000-4000-8000-000000000086'),
  ('57000000-0000-4000-8000-000000000077', '57000000-0000-4000-8000-000000000067', 1, '{"schemaVersion":1,"name":"Frozen","workouts":[]}'::JSONB, NULL, 'frozen', '57000000-0000-4000-8000-000000000087'),
  ('57000000-0000-4000-8000-000000000078', '57000000-0000-4000-8000-000000000068', 1, '{"schemaVersion":1,"name":"Cancelled","workouts":[]}'::JSONB, NULL, 'cancelled', '57000000-0000-4000-8000-000000000088'),
  ('57000000-0000-4000-8000-000000000079', '57000000-0000-4000-8000-000000000069', 1, '{"schemaVersion":1,"name":"Invalid identity","workouts":[]}'::JSONB, NULL, 'proposed', '57000000-0000-4000-8000-000000000089'),
  ('57000000-0000-4000-8000-00000000007a', '57000000-0000-4000-8000-00000000006a', 1, '{"schemaVersion":1,"name":"Foreign","workouts":[]}'::JSONB, NULL, 'proposed', '57000000-0000-4000-8000-00000000008a');

INSERT INTO public.workout_plans (
  id, user_id, name, family_id, is_active, source_type, library_slot, prescription_locked,
  trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id
) VALUES
  ('57000000-0000-4000-8000-000000000081', '57000000-0000-4000-8000-000000000002', 'Main', gen_random_uuid(), TRUE, 'trainer_assigned', 'professional', TRUE, '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000061', '57000000-0000-4000-8000-000000000071'),
  ('57000000-0000-4000-8000-000000000082', '57000000-0000-4000-8000-000000000002', 'Boundary', gen_random_uuid(), FALSE, 'trainer_assigned', 'professional', TRUE, '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000062', '57000000-0000-4000-8000-000000000072'),
  ('57000000-0000-4000-8000-000000000083', '57000000-0000-4000-8000-000000000002', 'Blank', gen_random_uuid(), FALSE, 'trainer_assigned', 'professional', TRUE, '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000063', '57000000-0000-4000-8000-000000000073'),
  ('57000000-0000-4000-8000-000000000084', '57000000-0000-4000-8000-000000000002', 'Invalid', gen_random_uuid(), FALSE, 'trainer_assigned', 'professional', TRUE, '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000064', '57000000-0000-4000-8000-000000000074'),
  ('57000000-0000-4000-8000-000000000085', '57000000-0000-4000-8000-000000000002', 'Conflict', gen_random_uuid(), FALSE, 'trainer_assigned', 'professional', TRUE, '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000065', '57000000-0000-4000-8000-000000000075'),
  ('57000000-0000-4000-8000-000000000086', '57000000-0000-4000-8000-000000000002', 'Active', gen_random_uuid(), FALSE, 'trainer_assigned', 'professional', TRUE, '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000066', '57000000-0000-4000-8000-000000000076'),
  ('57000000-0000-4000-8000-000000000087', '57000000-0000-4000-8000-000000000002', 'Frozen', gen_random_uuid(), FALSE, 'trainer_assigned', 'professional', TRUE, '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000067', '57000000-0000-4000-8000-000000000077'),
  ('57000000-0000-4000-8000-000000000088', '57000000-0000-4000-8000-000000000002', 'Cancelled', gen_random_uuid(), FALSE, 'trainer_assigned', 'professional', TRUE, '57000000-0000-4000-8000-000000000041', '57000000-0000-4000-8000-000000000068', '57000000-0000-4000-8000-000000000078'),
  ('57000000-0000-4000-8000-000000000089', '57000000-0000-4000-8000-000000000002', 'Invalid identity', gen_random_uuid(), FALSE, 'trainer_assigned', 'professional', TRUE, '57000000-0000-4000-8000-000000000042', '57000000-0000-4000-8000-000000000069', '57000000-0000-4000-8000-000000000079'),
  ('57000000-0000-4000-8000-00000000008a', '57000000-0000-4000-8000-000000000003', 'Foreign', gen_random_uuid(), FALSE, 'trainer_assigned', 'professional', TRUE, '57000000-0000-4000-8000-000000000042', '57000000-0000-4000-8000-00000000006a', '57000000-0000-4000-8000-00000000007a');

SELECT has_column('public', 'trainer_plan_assignments', 'decline_idempotency_key', 'decline idempotency is persisted on assignments');
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.trainer_plan_assignments'::REGCLASS
      AND conname = 'trainer_plan_assignments_decline_idempotency_key_check'
      AND contype = 'c'
      AND convalidated
      AND pg_get_expr(conbin, conrelid) =
        '((decline_idempotency_key IS NULL) OR ((char_length(btrim(decline_idempotency_key)) >= 1) AND (char_length(btrim(decline_idempotency_key)) <= 200)))'
  ),
  'decline idempotency has the exact validated nullable trimmed-length check'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_class index_row
    JOIN pg_index index_definition ON index_definition.indexrelid = index_row.oid
    JOIN pg_attribute client_column
      ON client_column.attrelid = index_definition.indrelid
     AND client_column.attname = 'client_user_id'
     AND NOT client_column.attisdropped
    JOIN pg_attribute decline_column
      ON decline_column.attrelid = index_definition.indrelid
     AND decline_column.attname = 'decline_idempotency_key'
     AND NOT decline_column.attisdropped
    WHERE index_row.relname = 'trainer_plan_assignments_decline_idempotency_unique'
      AND index_definition.indrelid = 'public.trainer_plan_assignments'::REGCLASS
      AND index_definition.indnkeyatts = 2
      AND index_definition.indnatts = 2
      AND index_definition.indexprs IS NULL
      AND index_definition.indkey[0] = client_column.attnum
      AND index_definition.indkey[1] = decline_column.attnum
      AND index_definition.indisunique
      AND index_definition.indisvalid
      AND index_definition.indisready
      AND index_definition.indislive
      AND index_definition.indpred IS NOT NULL
      AND pg_get_expr(index_definition.indpred, index_definition.indrelid) = '(decline_idempotency_key IS NOT NULL)'
  ),
  'decline idempotency has the exact live owner-scoped partial unique index'
);
SELECT ok(
  public.is_professional_audit_event_allowed('trainer_plan_assignment', 'declined'),
  'declined assignments are in the final professional audit allowlist'
);

SELECT set_config('request.jwt.claim.sub', '57000000-0000-4000-8000-000000000002', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$SELECT assignment_id, changed FROM public.decline_trainer_assignment(
    '57000000-0000-4000-8000-000000000061', '  Necesito otra progresion.  ', '  decline-main-key  '
  )$$,
  $$VALUES ('57000000-0000-4000-8000-000000000061'::UUID, TRUE)$$,
  'an owner can decline a proposal after the relationship has ended'
);

RESET ROLE;
SELECT is(
  (SELECT status || ':' || decline_idempotency_key FROM public.trainer_plan_assignments WHERE id = '57000000-0000-4000-8000-000000000061'),
  'cancelled:decline-main-key',
  'the assignment is cancelled with the trimmed idempotency key'
);
SELECT is(
  (SELECT status FROM public.trainer_assignment_versions WHERE id = '57000000-0000-4000-8000-000000000071'),
  'cancelled',
  'only the proposed version is cancelled'
);
SELECT is(
  (SELECT is_active FROM public.workout_plans WHERE id = '57000000-0000-4000-8000-000000000081'),
  FALSE,
  'the locked materialized plan is defensively inactive'
);
SELECT is(
  (SELECT jsonb_build_object('snapshot', snapshot, 'planId', materialized_plan_id)
   FROM public.trainer_assignment_versions WHERE id = '57000000-0000-4000-8000-000000000071'),
  '{"planId":"57000000-0000-4000-8000-000000000081","snapshot":{"name":"Main","workouts":[],"schemaVersion":1}}'::JSONB,
  'decline preserves snapshot and materialized plan identity'
);
SELECT is(
  (SELECT accepted_at IS NULL AND active_version_id IS NULL FROM public.trainer_plan_assignments WHERE id = '57000000-0000-4000-8000-000000000061'),
  TRUE,
  'decline leaves acceptance fields untouched'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs
   WHERE entity_id = '57000000-0000-4000-8000-000000000061' AND action = 'declined'),
  1::BIGINT,
  'decline writes one audit event'
);
SELECT is(
  (SELECT metadata FROM public.professional_audit_logs
   WHERE entity_id = '57000000-0000-4000-8000-000000000061' AND action = 'declined'),
  '{}'::JSONB,
  'the decline audit metadata is empty'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications
   WHERE dedupe_key = 'coaching-assignment-declined:57000000-0000-4000-8000-000000000061'),
  1::BIGINT,
  'decline writes one deduplicated trainer notification'
);
SELECT is(
  (SELECT jsonb_build_object('body', body, 'url', url, 'payload', payload)
   FROM public.product_notifications
   WHERE dedupe_key = 'coaching-assignment-declined:57000000-0000-4000-8000-000000000061'),
  '{"body":"Necesito otra progresion.","url":"/coach/programs?clientId=57000000-0000-4000-8000-000000000002","payload":{"assignment_id":"57000000-0000-4000-8000-000000000061","client_user_id":"57000000-0000-4000-8000-000000000002","relationship_id":"57000000-0000-4000-8000-000000000041"}}'::JSONB,
  'the trainer notification contains trimmed reason and identifier-only navigation payload'
);

SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$SELECT assignment_id, changed FROM public.decline_trainer_assignment(
    '57000000-0000-4000-8000-000000000061', 'Replacement must not win', 'decline-main-key'
  )$$,
  $$VALUES ('57000000-0000-4000-8000-000000000061'::UUID, FALSE)$$,
  'an exact retry returns success without changing state'
);
RESET ROLE;
SELECT is(
  (SELECT jsonb_build_object(
    'audits', (SELECT count(*) FROM public.professional_audit_logs WHERE entity_id = '57000000-0000-4000-8000-000000000061' AND action = 'declined'),
    'notifications', (SELECT count(*) FROM public.product_notifications WHERE dedupe_key = 'coaching-assignment-declined:57000000-0000-4000-8000-000000000061'),
    'body', (SELECT body FROM public.product_notifications WHERE dedupe_key = 'coaching-assignment-declined:57000000-0000-4000-8000-000000000061')
  )),
  '{"audits":1,"notifications":1,"body":"Necesito otra progresion."}'::JSONB,
  'retry does not duplicate side effects or replace the first reason'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-000000000061', NULL, 'decline-main-key-2')$$,
  'P0001', 'TRAINER_ASSIGNMENT_NOT_PROPOSED',
  'a different key cannot replay a terminal decline'
);
SELECT results_eq(
  $$SELECT assignment_id, changed FROM public.decline_trainer_assignment(
    '57000000-0000-4000-8000-000000000063', '   ', 'blank-reason-key'
  )$$,
  $$VALUES ('57000000-0000-4000-8000-000000000063'::UUID, TRUE)$$,
  'a blank optional reason is accepted'
);
RESET ROLE;
SELECT is(
  (SELECT body FROM public.product_notifications
   WHERE dedupe_key = 'coaching-assignment-declined:57000000-0000-4000-8000-000000000063'),
  'Tu cliente decidió no aceptar la rutina profesional.',
  'blank reasons use safe generic Spanish notification copy'
);

SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$SELECT assignment_id, changed FROM public.decline_trainer_assignment(
    '57000000-0000-4000-8000-000000000062', repeat('r', 500), repeat('k', 200)
  )$$,
  $$VALUES ('57000000-0000-4000-8000-000000000062'::UUID, TRUE)$$,
  'the exact reason and idempotency boundaries are accepted'
);
RESET ROLE;
SELECT is(
  (SELECT char_length(body) + char_length(decline_idempotency_key)
   FROM public.product_notifications notification
   JOIN public.trainer_plan_assignments assignment
     ON assignment.id = '57000000-0000-4000-8000-000000000062'
   WHERE notification.dedupe_key = 'coaching-assignment-declined:57000000-0000-4000-8000-000000000062'),
  700,
  'the accepted boundary values are stored without truncation'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-000000000064', repeat('r', 501), 'reason-too-long')$$,
  'P0001', 'TRAINER_ASSIGNMENT_DECLINE_INVALID',
  'a 501-character reason is rejected'
);
RESET ROLE;
SELECT is(
  (SELECT status FROM public.trainer_plan_assignments WHERE id = '57000000-0000-4000-8000-000000000064'),
  'proposed',
  'invalid reason validation is atomic'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-000000000064', NULL, '   ')$$,
  'P0001', 'TRAINER_ASSIGNMENT_DECLINE_INVALID',
  'a blank idempotency key is rejected'
);
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-000000000064', NULL, repeat('k', 201))$$,
  'P0001', 'TRAINER_ASSIGNMENT_DECLINE_INVALID',
  'a 201-character idempotency key is rejected'
);
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-000000000065', NULL, 'decline-main-key')$$,
  'P0001', 'TRAINER_ASSIGNMENT_DECLINE_IDEMPOTENCY_CONFLICT',
  'an owner-scoped key collision is controlled instead of leaking a unique violation'
);
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-00000000006a', NULL, 'foreign-key')$$,
  'P0001', 'TRAINER_ASSIGNMENT_NOT_FOUND',
  'a foreign assignment is hidden from the caller'
);
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57ffffff-0000-4000-8000-000000000061', NULL, 'missing-key')$$,
  'P0001', 'TRAINER_ASSIGNMENT_NOT_FOUND',
  'a random assignment uses the same generic denial'
);
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-000000000066', NULL, 'active-key')$$,
  'P0001', 'TRAINER_ASSIGNMENT_NOT_PROPOSED',
  'an active assignment cannot be declined'
);
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-000000000067', NULL, 'frozen-key')$$,
  'P0001', 'TRAINER_ASSIGNMENT_NOT_PROPOSED',
  'a frozen assignment cannot be declined'
);
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-000000000068', NULL, 'cancelled-key')$$,
  'P0001', 'TRAINER_ASSIGNMENT_NOT_PROPOSED',
  'an unrelated cancelled assignment cannot be declined'
);
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-000000000069', NULL, 'invalid-plan-key')$$,
  'P0001', 'TRAINER_ASSIGNMENT_PLAN_INVALID',
  'a proposal with mismatched materialized identity is rejected'
);
RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE action = 'declined'),
  3::BIGINT,
  'only successful first writes produce decline audit rows'
);

CREATE TEMP TABLE decline_catalog_restore (allowlist_ddl TEXT NOT NULL);
INSERT INTO decline_catalog_restore (allowlist_ddl)
SELECT pg_get_functiondef('public.is_professional_audit_event_allowed(text,text)'::REGPROCEDURE);

ALTER TABLE public.trainer_plan_assignments
  DROP CONSTRAINT trainer_plan_assignments_decline_idempotency_key_check;
ALTER TABLE public.trainer_plan_assignments
  ADD CONSTRAINT trainer_plan_assignments_decline_idempotency_key_check CHECK (TRUE);
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  'P0001', 'TRAINER_SECURITY_PREFLIGHT_FAILED',
  'preflight rejects a weakened decline idempotency check'
);
ALTER TABLE public.trainer_plan_assignments
  DROP CONSTRAINT trainer_plan_assignments_decline_idempotency_key_check;
ALTER TABLE public.trainer_plan_assignments
  ADD CONSTRAINT trainer_plan_assignments_decline_idempotency_key_check
  CHECK (
    decline_idempotency_key IS NULL
    OR char_length(btrim(decline_idempotency_key)) BETWEEN 1 AND 200
  );
SELECT is(
  public.trainer_security_preflight(),
  57,
  'preflight recovers after restoring the exact decline idempotency check'
);

DROP INDEX public.trainer_plan_assignments_decline_idempotency_unique;
CREATE UNIQUE INDEX trainer_plan_assignments_decline_idempotency_unique
  ON public.trainer_plan_assignments (client_user_id, decline_idempotency_key)
  WHERE decline_idempotency_key IS NULL;
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  'P0001', 'TRAINER_SECURITY_PREFLIGHT_FAILED',
  'preflight rejects the wrong decline index predicate'
);
DROP INDEX public.trainer_plan_assignments_decline_idempotency_unique;
CREATE UNIQUE INDEX trainer_plan_assignments_decline_idempotency_unique
  ON public.trainer_plan_assignments (client_user_id, decline_idempotency_key)
  WHERE decline_idempotency_key IS NOT NULL;
SELECT is(
  public.trainer_security_preflight(),
  57,
  'preflight recovers after restoring the exact decline index'
);

CREATE OR REPLACE FUNCTION public.is_professional_audit_event_allowed(
  p_entity_type TEXT,
  p_action TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$ SELECT FALSE $$;
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  'P0001', 'TRAINER_SECURITY_PREFLIGHT_FAILED',
  'preflight rejects a downgraded audit allowlist'
);
DO $restore$
DECLARE definition TEXT;
BEGIN
  SELECT allowlist_ddl INTO definition FROM decline_catalog_restore;
  EXECUTE definition;
END;
$restore$;
SELECT is(
  public.trainer_security_preflight(),
  57,
  'preflight recovers after restoring the decline audit allowlist'
);

SELECT set_config('request.jwt.claim.sub', '', TRUE);
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.decline_trainer_assignment('57000000-0000-4000-8000-000000000064', NULL, 'anon-key')$$,
  '42501',
  'permission denied for function decline_trainer_assignment',
  'anonymous callers cannot execute the decline RPC'
);
RESET ROLE;

SELECT ok(
  (
    SELECT procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=public, pg_temp']::TEXT[]
      AND owner_role.rolname = 'postgres'
    FROM pg_proc procedure
    JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
    WHERE procedure.oid = 'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE
  )
  AND has_function_privilege('authenticated', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE'),
  'decline is postgres-owned SECURITY DEFINER with fixed search path and least-privilege ACLs'
);

SELECT is(public.trainer_security_preflight(), 57, 'trainer preflight marks the assignment decline boundary');

SELECT * FROM finish();
ROLLBACK;
