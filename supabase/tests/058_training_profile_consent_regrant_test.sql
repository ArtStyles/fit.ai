BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(43);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('58000000-0000-4000-8000-000000000001', 'consent-active-trainer@example.test', '{}'::JSONB),
  ('58000000-0000-4000-8000-000000000002', 'consent-owner@example.test', '{}'::JSONB),
  ('58000000-0000-4000-8000-000000000003', 'consent-foreign@example.test', '{}'::JSONB),
  ('58000000-0000-4000-8000-000000000004', 'consent-ended@example.test', '{}'::JSONB),
  ('58000000-0000-4000-8000-000000000005', 'consent-paused@example.test', '{}'::JSONB),
  ('58000000-0000-4000-8000-000000000006', 'consent-inactive-client@example.test', '{}'::JSONB),
  ('58000000-0000-4000-8000-000000000007', 'consent-inactive-trainer@example.test', '{}'::JSONB),
  ('58000000-0000-4000-8000-000000000008', 'consent-inactive-trainer-client@example.test', '{}'::JSONB),
  ('58000000-0000-4000-8000-000000000009', 'consent-inactive-profile@example.test', '{}'::JSONB),
  ('58000000-0000-4000-8000-00000000000a', 'consent-inactive-profile-client@example.test', '{}'::JSONB);

INSERT INTO public.profiles (id, full_name, onboarding_done, account_status) VALUES
  ('58000000-0000-4000-8000-000000000001', 'Consent active trainer', TRUE, 'active'),
  ('58000000-0000-4000-8000-000000000002', 'Consent owner', TRUE, 'active'),
  ('58000000-0000-4000-8000-000000000003', 'Consent foreign client', TRUE, 'active'),
  ('58000000-0000-4000-8000-000000000004', 'Consent ended client', TRUE, 'active'),
  ('58000000-0000-4000-8000-000000000005', 'Consent paused client', TRUE, 'active'),
  ('58000000-0000-4000-8000-000000000006', 'Consent inactive client', TRUE, 'suspended'),
  ('58000000-0000-4000-8000-000000000007', 'Consent inactive trainer', TRUE, 'suspended'),
  ('58000000-0000-4000-8000-000000000008', 'Consent inactive trainer client', TRUE, 'active'),
  ('58000000-0000-4000-8000-000000000009', 'Consent inactive profile trainer', TRUE, 'active'),
  ('58000000-0000-4000-8000-00000000000a', 'Consent inactive profile client', TRUE, 'active');

INSERT INTO public.trainer_applications (id, user_id, status, decided_at) VALUES
  ('58000000-0000-4000-8000-000000000011', '58000000-0000-4000-8000-000000000001', 'approved', NOW()),
  ('58000000-0000-4000-8000-000000000012', '58000000-0000-4000-8000-000000000007', 'approved', NOW()),
  ('58000000-0000-4000-8000-000000000013', '58000000-0000-4000-8000-000000000009', 'approved', NOW());

INSERT INTO public.trainer_profiles (
  id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary
) VALUES
  ('58000000-0000-4000-8000-000000000021', '58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000011', 'consent-active-trainer', 'active', 'Consent active trainer', 'Bio', 'Evidence'),
  ('58000000-0000-4000-8000-000000000022', '58000000-0000-4000-8000-000000000007', '58000000-0000-4000-8000-000000000012', 'consent-inactive-trainer', 'active', 'Consent inactive trainer', 'Bio', 'Evidence'),
  ('58000000-0000-4000-8000-000000000023', '58000000-0000-4000-8000-000000000009', '58000000-0000-4000-8000-000000000013', 'consent-inactive-profile', 'inactive', 'Consent inactive profile', 'Bio', 'Evidence');

INSERT INTO public.trainer_service_offerings (
  id, trainer_profile_id, name, modality, duration_minutes
) VALUES
  ('58000000-0000-4000-8000-000000000031', '58000000-0000-4000-8000-000000000021', 'Consent active service', 'online', 60),
  ('58000000-0000-4000-8000-000000000032', '58000000-0000-4000-8000-000000000022', 'Consent inactive trainer service', 'online', 60),
  ('58000000-0000-4000-8000-000000000033', '58000000-0000-4000-8000-000000000023', 'Consent inactive profile service', 'online', 60);

INSERT INTO public.coaching_relationships (
  id, service_id, trainer_user_id, client_user_id, status, paused_at, ended_at, ended_by, end_reason
) VALUES
  ('58000000-0000-4000-8000-000000000041', '58000000-0000-4000-8000-000000000031', '58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000002', 'active', NULL, NULL, NULL, NULL),
  ('58000000-0000-4000-8000-000000000042', '58000000-0000-4000-8000-000000000031', '58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000003', 'active', NULL, NULL, NULL, NULL),
  ('58000000-0000-4000-8000-000000000043', '58000000-0000-4000-8000-000000000031', '58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000004', 'ended', NULL, NOW(), '58000000-0000-4000-8000-000000000004', 'Ended fixture'),
  ('58000000-0000-4000-8000-000000000044', '58000000-0000-4000-8000-000000000031', '58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000005', 'paused_by_platform', NOW(), NULL, NULL, NULL),
  ('58000000-0000-4000-8000-000000000045', '58000000-0000-4000-8000-000000000031', '58000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000006', 'active', NULL, NULL, NULL, NULL),
  ('58000000-0000-4000-8000-000000000046', '58000000-0000-4000-8000-000000000032', '58000000-0000-4000-8000-000000000007', '58000000-0000-4000-8000-000000000008', 'active', NULL, NULL, NULL, NULL),
  ('58000000-0000-4000-8000-000000000047', '58000000-0000-4000-8000-000000000033', '58000000-0000-4000-8000-000000000009', '58000000-0000-4000-8000-00000000000a', 'active', NULL, NULL, NULL, NULL);

SELECT ok(
  to_regprocedure('public.grant_training_profile_consent(uuid,text,uuid)') IS NOT NULL,
  'training-profile consent recovery RPC exists with the exact input signature'
);
SELECT ok(
  (
    SELECT procedure.proallargtypes = ARRAY[
        'uuid'::REGTYPE::OID,
        'text'::REGTYPE::OID,
        'uuid'::REGTYPE::OID,
        'uuid'::REGTYPE::OID,
        'boolean'::REGTYPE::OID
      ]
      AND procedure.proargmodes = ARRAY[
        'i'::"char",
        'i'::"char",
        'i'::"char",
        't'::"char",
        't'::"char"
      ]
      AND procedure.proargnames = ARRAY[
        'p_relationship_id',
        'p_consent_version',
        'p_idempotency_key',
        'relationship_id',
        'changed'
      ]::TEXT[]
    FROM pg_proc procedure
    WHERE procedure.oid = 'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE
  ),
  'training-profile consent recovery RPC exposes the exact ordered table contract'
);
SELECT ok(
  (
    SELECT procedure_language.lanname = 'plpgsql'
      AND procedure.prokind = 'f'
      AND procedure.provolatile = 'v'
      AND procedure.prorettype = 'record'::REGTYPE
      AND procedure.prosecdef
      AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
      AND owner_role.rolname = 'postgres'
    FROM pg_proc procedure
    JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
    JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
    WHERE procedure.oid = 'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE
  ),
  'training-profile consent recovery RPC is an exact postgres-owned volatile SECURITY DEFINER function'
);
SELECT ok(
  (
    SELECT NOT EXISTS (
      SELECT 1
      FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) expanded_acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = expanded_acl.grantee
      WHERE expanded_acl.privilege_type = 'EXECUTE'
        AND expanded_acl.grantee <> procedure.proowner
        AND (
          expanded_acl.is_grantable
          OR expanded_acl.grantee = 0
          OR grantee_role.rolname IS NULL
          OR grantee_role.rolname NOT IN ('authenticated', 'service_role')
        )
    )
    FROM pg_proc procedure
    WHERE procedure.oid = 'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE
  )
  AND has_function_privilege('authenticated', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE'),
  'training-profile consent recovery RPC has the exact least-privilege ACL'
);
SELECT ok(
  (
    SELECT strpos(procedure.prosrc, 'PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0))') > 0
      AND strpos(procedure.prosrc, 'FROM public.profiles client_account') > 0
      AND strpos(procedure.prosrc, 'AND relationship.trainer_user_id = v_trainer_user_id
  FOR UPDATE;') >
        strpos(procedure.prosrc, 'FROM public.profiles client_account')
      AND strpos(procedure.prosrc, 'AND relationship.trainer_user_id = v_trainer_user_id
  FOR UPDATE;') > 0
      AND strpos(procedure.prosrc, 'FROM public.coaching_consents consent') >
        strpos(procedure.prosrc, 'AND relationship.trainer_user_id = v_trainer_user_id
  FOR UPDATE;')
    FROM pg_proc procedure
    WHERE procedure.oid = 'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE
  ),
  'client and relationship locks serialize grant attempts before the active consent check'
);

SELECT set_config('request.jwt.claim.sub', '', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent(
    '58000000-0000-4000-8000-000000000041', 'training-profile-v1', '58000000-0000-4000-8000-000000000051'
  )$$,
  'P0001', 'COACHING_AUTH_REQUIRED',
  'an authenticated role without a user identity cannot recover training consent'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-000000000002', TRUE);
SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent(NULL, 'training-profile-v1', '58000000-0000-4000-8000-000000000052')$$,
  'P0001', 'COACHING_CONSENT_INVALID', 'a null relationship is rejected'
);
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000041', '   ', '58000000-0000-4000-8000-000000000053')$$,
  'P0001', 'COACHING_CONSENT_INVALID', 'a blank consent version is rejected'
);
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000041', repeat('v', 161), '58000000-0000-4000-8000-000000000054')$$,
  'P0001', 'COACHING_CONSENT_INVALID', 'an overlong consent version is rejected'
);
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000041', 'body-measurements-v1', '58000000-0000-4000-8000-000000000054')$$,
  'P0001', 'COACHING_CONSENT_INVALID', 'only the current training-profile consent text can be granted'
);
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000041', 'training-profile-v1', NULL)$$,
  'P0001', 'COACHING_CONSENT_INVALID', 'a null idempotency key is rejected'
);
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000042', 'training-profile-v1', '58000000-0000-4000-8000-000000000055')$$,
  'P0001', 'COACHING_RELATIONSHIP_NOT_ACTIVE', 'a client cannot grant consent for another client relationship'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-000000000004', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000043', 'training-profile-v1', '58000000-0000-4000-8000-000000000056')$$,
  'P0001', 'COACHING_RELATIONSHIP_NOT_ACTIVE', 'an ended relationship cannot recover training consent'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-000000000005', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000044', 'training-profile-v1', '58000000-0000-4000-8000-000000000057')$$,
  'P0001', 'COACHING_RELATIONSHIP_NOT_ACTIVE', 'a paused relationship cannot recover training consent'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-000000000006', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000045', 'training-profile-v1', '58000000-0000-4000-8000-000000000058')$$,
  'P0001', 'COACHING_RELATIONSHIP_NOT_ACTIVE', 'an inactive client cannot recover training consent'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-000000000008', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000046', 'training-profile-v1', '58000000-0000-4000-8000-000000000059')$$,
  'P0001', 'COACHING_RELATIONSHIP_NOT_ACTIVE', 'a relationship with an inactive trainer account cannot recover training consent'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-00000000000a', TRUE);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000047', 'training-profile-v1', '58000000-0000-4000-8000-00000000005a')$$,
  'P0001', 'COACHING_RELATIONSHIP_NOT_ACTIVE', 'a relationship with an inactive trainer profile cannot recover training consent'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-000000000002', TRUE);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$SELECT relationship_id, changed FROM public.grant_training_profile_consent(
    '58000000-0000-4000-8000-000000000041', '  training-profile-v1  ', '58000000-0000-4000-8000-00000000005b'
  )$$,
  $$VALUES ('58000000-0000-4000-8000-000000000041'::UUID, TRUE)$$,
  'the owning client can explicitly recover missing training-profile consent'
);
RESET ROLE;

SELECT is(
  (
    SELECT relationship_id::TEXT || ':' || scope || ':' || text_version || ':' || granted_by::TEXT || ':' || (revoked_at IS NULL)::TEXT
    FROM public.coaching_consents
    WHERE relationship_id = '58000000-0000-4000-8000-000000000041'
      AND scope = 'training_profile'
      AND revoked_at IS NULL
  ),
  '58000000-0000-4000-8000-000000000041:training_profile:training-profile-v1:58000000-0000-4000-8000-000000000002:true',
  'the recovered grant stores the relationship, trimmed version, client actor, and active state'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_consents WHERE relationship_id = '58000000-0000-4000-8000-000000000041' AND scope = 'training_profile' AND revoked_at IS NULL),
  1::BIGINT,
  'exactly one active training-profile grant exists'
);
SELECT is(
  (SELECT count(*) FROM public.coaching_consents WHERE relationship_id = '58000000-0000-4000-8000-000000000041' AND scope = 'body_measurements'),
  0::BIGINT,
  'recovering required training data does not grant optional body measurements'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE entity_id = '58000000-0000-4000-8000-000000000041' AND action = 'training_profile_consent_granted'),
  1::BIGINT,
  'the recovered grant records one professional audit event'
);
SELECT is(
  (
    SELECT actor_user_id::TEXT || ':' || subject_user_id::TEXT
    FROM public.professional_audit_logs
    WHERE entity_id = '58000000-0000-4000-8000-000000000041'
      AND action = 'training_profile_consent_granted'
  ),
  '58000000-0000-4000-8000-000000000002:58000000-0000-4000-8000-000000000001',
  'the audit identifies the client actor and trainer subject'
);
SELECT is(
  (
    SELECT metadata
    FROM public.professional_audit_logs
    WHERE entity_id = '58000000-0000-4000-8000-000000000041'
      AND action = 'training_profile_consent_granted'
  ),
  '{"scope":"training_profile","text_version":"training-profile-v1"}'::JSONB,
  'the audit keeps only the allowlisted grant version and scope'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE dedupe_key = 'coaching-training-profile-granted:58000000-0000-4000-8000-000000000041'),
  1::BIGINT,
  'the recovered grant notifies the trainer once'
);
SELECT is(
  (
    SELECT user_id::TEXT || ':' || url
    FROM public.product_notifications
    WHERE dedupe_key = 'coaching-training-profile-granted:58000000-0000-4000-8000-000000000041'
  ),
  '58000000-0000-4000-8000-000000000001:/coach/clients/58000000-0000-4000-8000-000000000002',
  'the trainer notification links directly to the owning client detail'
);
SELECT is(
  (
    SELECT jsonb_build_object('type', type, 'payload', payload)
    FROM public.product_notifications
    WHERE dedupe_key = 'coaching-training-profile-granted:58000000-0000-4000-8000-000000000041'
  ),
  '{"type":"coaching_training_profile_granted","payload":{"scope":"training_profile","client_user_id":"58000000-0000-4000-8000-000000000002","relationship_id":"58000000-0000-4000-8000-000000000041"}}'::JSONB,
  'the deduplicated notification carries only the scoped relationship identity'
);

SELECT set_config('request.jwt.claim.sub', '58000000-0000-4000-8000-000000000002', TRUE);
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$SELECT relationship_id, changed FROM public.grant_training_profile_consent(
    '58000000-0000-4000-8000-000000000041', 'training-profile-v1', '58000000-0000-4000-8000-00000000005b'
  )$$,
  $$VALUES ('58000000-0000-4000-8000-000000000041'::UUID, FALSE)$$,
  'an exact retry returns unchanged without duplicate effects'
);
RESET ROLE;
SELECT is(
  (SELECT count(*) FROM public.coaching_consents WHERE relationship_id = '58000000-0000-4000-8000-000000000041' AND scope = 'training_profile' AND revoked_at IS NULL),
  1::BIGINT,
  'an exact retry preserves one active grant'
);
SELECT is(
  (SELECT count(*) FROM public.professional_audit_logs WHERE entity_id = '58000000-0000-4000-8000-000000000041' AND action = 'training_profile_consent_granted'),
  1::BIGINT,
  'an exact retry does not duplicate audit evidence'
);
SELECT is(
  (SELECT count(*) FROM public.product_notifications WHERE dedupe_key = 'coaching-training-profile-granted:58000000-0000-4000-8000-000000000041'),
  1::BIGINT,
  'an exact retry does not duplicate the trainer notification'
);

SELECT is(public.trainer_security_preflight(), 58, 'trainer preflight marks the consent recovery boundary');

SELECT set_config('request.jwt.claim.sub', '', TRUE);
SELECT set_config('request.jwt.claim.role', 'anon', TRUE);
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.grant_training_profile_consent('58000000-0000-4000-8000-000000000041', 'training-profile-v1', '58000000-0000-4000-8000-00000000005c')$$,
  '42501', 'permission denied for function grant_training_profile_consent',
  'anonymous callers cannot execute the consent recovery RPC'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', TRUE);
SELECT set_config('request.jwt.claim.role', '', TRUE);

ALTER FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID)
  SET statement_timeout = '5s';
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  'P0001', 'TRAINER_SECURITY_PREFLIGHT_FAILED',
  'preflight rejects extra consent recovery RPC configuration'
);
ALTER FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID)
  RESET statement_timeout;
SELECT is(public.trainer_security_preflight(), 58, 'preflight recovers after restoring exact consent RPC configuration');

CREATE ROLE training_consent_rogue_owner NOLOGIN;
ALTER FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID)
  OWNER TO training_consent_rogue_owner;
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  'P0001', 'TRAINER_SECURITY_PREFLIGHT_FAILED',
  'preflight rejects a non-postgres consent recovery RPC owner'
);
ALTER FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID) OWNER TO postgres;
DROP ROLE training_consent_rogue_owner;
SELECT is(public.trainer_security_preflight(), 58, 'preflight recovers after restoring consent RPC ownership');

CREATE ROLE training_consent_extra_executor NOLOGIN;
GRANT EXECUTE ON FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID)
  TO training_consent_extra_executor;
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  'P0001', 'TRAINER_SECURITY_PREFLIGHT_FAILED',
  'preflight rejects an extra consent recovery RPC executor'
);
REVOKE EXECUTE ON FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID)
  FROM training_consent_extra_executor;
DROP ROLE training_consent_extra_executor;
SELECT is(public.trainer_security_preflight(), 58, 'preflight recovers after removing the extra consent RPC executor');

GRANT EXECUTE ON FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID)
  TO authenticated WITH GRANT OPTION;
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  'P0001', 'TRAINER_SECURITY_PREFLIGHT_FAILED',
  'preflight rejects authenticated grant option on consent recovery'
);
REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID)
  FROM authenticated;
SELECT is(public.trainer_security_preflight(), 58, 'preflight recovers after removing authenticated consent grant option');

GRANT EXECUTE ON FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID)
  TO service_role WITH GRANT OPTION;
SELECT throws_ok(
  $$SELECT public.trainer_security_preflight()$$,
  'P0001', 'TRAINER_SECURITY_PREFLIGHT_FAILED',
  'preflight rejects service-role grant option on consent recovery'
);
REVOKE GRANT OPTION FOR EXECUTE ON FUNCTION public.grant_training_profile_consent(UUID, TEXT, UUID)
  FROM service_role;
SELECT is(public.trainer_security_preflight(), 58, 'preflight recovers after removing service-role consent grant option');

SELECT * FROM finish();
ROLLBACK;
