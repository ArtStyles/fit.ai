-- Management identity is independent from protected training evidence.
-- Existing insight authority, RLS and lifecycle functions remain unchanged.
CREATE OR REPLACE FUNCTION public.get_coach_relationship_management() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  actor uuid := auth.uid();
  result jsonb;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles account
    JOIN public.trainer_profiles trainer ON trainer.user_id=account.id
    WHERE account.id=actor AND account.account_status='active' AND trainer.status='active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='COACH_RELATIONSHIP_MANAGEMENT_UNAVAILABLE';
  END IF;
  WITH managed AS MATERIALIZED (
    SELECT r.id, r.client_user_id, r.status, r.started_at,
      COALESCE(NULLIF(btrim(identity.full_name),''),NULLIF(btrim(identity.username),'')) AS client_name,
      NULLIF(btrim(identity.username),'') AS username, NULLIF(btrim(identity.avatar_url),'') AS avatar_url,
      COALESCE(NULLIF(btrim(service.name),''),'Servicio de acompañamiento') AS service_name,
      EXISTS (SELECT 1 FROM public.coaching_consents c WHERE c.relationship_id=r.id
        AND c.scope='training_profile' AND c.revoked_at IS NULL) AS consent_active,
      COALESCE(account.account_status='active',false) AS account_active
    FROM public.coaching_relationships r
    LEFT JOIN public.public_profiles identity ON identity.id=r.client_user_id
    LEFT JOIN public.profiles account ON account.id=r.client_user_id
    LEFT JOIN public.trainer_service_offerings service ON service.id=r.service_id
    WHERE r.trainer_user_id=actor AND r.status IN ('active','paused_by_platform')
  )
  SELECT jsonb_build_object(
    'counts',jsonb_build_object(
      'pendingRequests',(SELECT count(*) FROM public.coaching_requests WHERE trainer_user_id=actor AND status='pending'),
      'activeRelationships',(SELECT count(*) FROM managed WHERE status='active'),
      'pausedRelationships',(SELECT count(*) FROM managed WHERE status='paused_by_platform')
    ),
    'relationships',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'relationshipId',id,'clientId',client_user_id,'clientName',client_name,'username',username,
      'avatarUrl',avatar_url,'serviceName',service_name,'status',status,'startedAt',started_at,
      'trainingConsentActive',consent_active,
      'trainingAccessAvailable',status='active' AND account_active AND consent_active
    ) ORDER BY started_at DESC,id),'[]'::jsonb) FROM managed)
  ) INTO result;
  RETURN result;
END;
$$;
ALTER FUNCTION public.get_coach_relationship_management() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_coach_relationship_management() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_coach_relationship_management() TO authenticated;

-- Preserve every existing preflight check; append the management boundary.
CREATE OR REPLACE FUNCTION public.trainer_security_preflight() RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
BEGIN
  IF to_regprocedure('public.prepare_trainer_credential_removal(uuid,uuid)') IS NULL
    OR to_regprocedure('public.accept_coaching_request(uuid,uuid)') IS NULL
    OR to_regprocedure('public.end_coaching_relationship(uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.propose_trainer_assignment(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.accept_trainer_assignment(uuid,text)') IS NULL
    OR to_regprocedure('public.publish_trainer_assignment_revision(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.decline_trainer_assignment(uuid,text,text)') IS NULL
    OR to_regprocedure('public.grant_training_profile_consent(uuid,text,uuid)') IS NULL
    OR to_regprocedure('public.get_coach_clients_summary()') IS NULL
    OR to_regprocedure('public.get_coach_client_insights(uuid,date,date)') IS NULL
    OR to_regprocedure('public.snapshot_admin_audit_identity()') IS NULL
    OR to_regprocedure('public.reactivate_and_reinstate_trainer(uuid,uuid)') IS NULL
    OR to_regprocedure('public.cleanup_trainer_security_e2e_fixture(text,uuid[])') IS NULL
    OR to_regprocedure('public.release_session_authorization(uuid,uuid)') IS NULL
    OR to_regprocedure('public.enforce_trainer_workout_iso_schedule()') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid = 'public.workouts'::regclass
        AND trigger_row.tgname = 'trg_enforce_trainer_workout_iso_schedule'
        AND trigger_row.tgenabled = 'O'
        AND NOT trigger_row.tgisinternal
    ) THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_SCHEMA_INCOMPLETE';
  END IF;

  IF to_regprocedure('public.append_trainer_template_exercises(uuid,jsonb)') IS NULL
    OR has_function_privilege('anon', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.propose_trainer_assignment(uuid,uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.append_trainer_template_exercises(uuid,jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.decline_trainer_assignment(uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.grant_training_profile_consent(uuid,text,uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.trainer_security_preflight()', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.trainer_security_preflight()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.trainer_security_preflight()', 'EXECUTE')
    OR NOT public.is_professional_audit_event_allowed('trainer_plan_assignment', 'declined')
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.is_professional_audit_event_allowed(text,text)'::REGPROCEDURE
        AND procedure_language.lanname = 'sql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'i'
        AND NOT procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
        AND btrim(replace(procedure.prosrc, E'\r\n', E'\n')) = btrim(replace($audit_event_allowlist$
  SELECT COALESCE(CASE p_entity_type
    WHEN 'professional_audit' THEN p_action IN ('legacy_event_redacted')
    WHEN 'trainer_application' THEN p_action IN (
      'application_draft_saved', 'application_submitted', 'application_withdrawn',
      'trainer_application_under_review', 'trainer_application_changes_requested',
      'trainer_application_interview_required', 'trainer_application_approved',
      'trainer_application_rejected', 'trainer_interview_scheduled'
    )
    WHEN 'trainer_interview' THEN p_action IN ('trainer_interview_outcome_recorded')
    WHEN 'coaching_request' THEN p_action IN (
      'created', 'cancelled', 'accepted', 'declined', 'cancelled_after_acceptance'
    )
    WHEN 'coaching_relationship' THEN p_action IN (
      'relationship_created', 'training_profile_consent_granted',
      'body_measurements_consent_granted', 'body_measurements_consent_revoked',
      'training_profile_consent_revoked', 'ended', 'resumed',
      'paused_due_to_account_suspension'
    )
    WHEN 'trainer_account' THEN p_action IN ('suspended')
    WHEN 'trainer_profile' THEN p_action IN (
      'profile_created', 'profile_updated', 'profile_deleted',
      'profile_status_changed', 'reinstated'
    )
    WHEN 'trainer_service' THEN p_action IN (
      'service_created', 'service_updated', 'service_deleted',
      'service_activated', 'service_deactivated'
    )
    WHEN 'trainer_program_template' THEN p_action IN (
      'template_created', 'template_updated', 'template_deleted', 'template_archived'
    )
    WHEN 'trainer_template_workout' THEN p_action IN (
      'template_workout_insert', 'template_workout_update', 'template_workout_delete'
    )
    WHEN 'trainer_template_exercise' THEN p_action IN (
      'template_exercise_insert', 'template_exercise_update', 'template_exercise_delete'
    )
    WHEN 'trainer_application_credential' THEN p_action IN (
      'credential_added', 'credential_removed', 'credential_removal_prepared',
      'credential_removal_retried', 'credential_cleanup_failed'
    )
    WHEN 'trainer_plan_assignment' THEN p_action IN (
      'proposed', 'accepted', 'revision_published', 'assignment_frozen', 'declined', 'assigned', 'removed'
    )
    ELSE FALSE
  END, FALSE)
        $audit_event_allowlist$, E'\r\n', E'\n'))
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE
        AND procedure_language.lanname = 'plpgsql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'v'
        AND procedure.prorettype = 'record'::REGTYPE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
        AND procedure.proallargtypes = ARRAY[
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'text'::REGTYPE::OID,
          'text'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID,
          'uuid'::REGTYPE::OID
        ]
        AND procedure.proargmodes = ARRAY[
          'i'::"char",
          'i'::"char",
          'i'::"char",
          'i'::"char",
          't'::"char",
          't'::"char",
          't'::"char"
        ]
        AND procedure.proargnames = ARRAY[
          'p_relationship_id',
          'p_template_id',
          'p_change_summary',
          'p_idempotency_key',
          'assignment_id',
          'assignment_version_id',
          'workout_plan_id'
        ]::TEXT[]
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.append_trainer_template_exercises(uuid,jsonb)'::REGPROCEDURE
        AND procedure_language.lanname = 'plpgsql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'v'
        AND procedure.prorettype = 'jsonb'::REGTYPE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_language procedure_language ON procedure_language.oid = procedure.prolang
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE
        AND procedure_language.lanname = 'plpgsql'
        AND procedure.prokind = 'f'
        AND procedure.provolatile = 'v'
        AND procedure.prorettype = 'record'::REGTYPE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
        AND procedure.proallargtypes = ARRAY[
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
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc procedure
      JOIN pg_roles owner_role ON owner_role.oid = procedure.proowner
      WHERE procedure.oid = 'public.trainer_security_preflight()'::REGPROCEDURE
        AND procedure.prosecdef
        AND procedure.proconfig = ARRAY['search_path=public, pg_temp']::TEXT[]
        AND owner_role.rolname = 'postgres'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_proc procedure
      CROSS JOIN LATERAL aclexplode(
        COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
      ) expanded_acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = expanded_acl.grantee
      WHERE procedure.oid IN (
          'public.is_professional_audit_event_allowed(text,text)'::REGPROCEDURE,
          'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE,
          'public.append_trainer_template_exercises(uuid,jsonb)'::REGPROCEDURE,
          'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE,
          'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE,
          'public.trainer_security_preflight()'::REGPROCEDURE
        )
        AND expanded_acl.privilege_type = 'EXECUTE'
        AND expanded_acl.grantee <> procedure.proowner
        AND (
          procedure.oid = 'public.is_professional_audit_event_allowed(text,text)'::REGPROCEDURE
          OR (
            procedure.oid IN (
              'public.propose_trainer_assignment(uuid,uuid,text,text)'::REGPROCEDURE,
              'public.append_trainer_template_exercises(uuid,jsonb)'::REGPROCEDURE,
              'public.decline_trainer_assignment(uuid,text,text)'::REGPROCEDURE,
              'public.grant_training_profile_consent(uuid,text,uuid)'::REGPROCEDURE,
              'public.trainer_security_preflight()'::REGPROCEDURE
            )
            AND (
              expanded_acl.is_grantable
              OR expanded_acl.grantee = 0
              OR grantee_role.rolname IS NULL
              OR grantee_role.rolname NOT IN ('authenticated', 'service_role')
            )
          )
        )
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_attribute column_row
      WHERE column_row.attrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND column_row.attname = 'decline_idempotency_key'
        AND column_row.atttypid = 'text'::REGTYPE
        AND NOT column_row.attnotnull
        AND NOT column_row.atthasdef
        AND column_row.attidentity = ''
        AND column_row.attgenerated = ''
        AND NOT column_row.attisdropped
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_constraint constraint_row
      WHERE constraint_row.conrelid = 'public.trainer_plan_assignments'::REGCLASS
        AND constraint_row.conname = 'trainer_plan_assignments_decline_idempotency_key_check'
        AND constraint_row.contype = 'c'
        AND constraint_row.convalidated
        AND pg_get_expr(constraint_row.conbin, constraint_row.conrelid) =
          '((decline_idempotency_key IS NULL) OR ((char_length(btrim(decline_idempotency_key)) >= 1) AND (char_length(btrim(decline_idempotency_key)) <= 200)))'
    )
    OR NOT EXISTS (
      SELECT 1
      FROM pg_class index_row
      JOIN pg_namespace namespace_row ON namespace_row.oid = index_row.relnamespace
      JOIN pg_index index_definition ON index_definition.indexrelid = index_row.oid
      JOIN pg_attribute client_column
        ON client_column.attrelid = index_definition.indrelid
       AND client_column.attname = 'client_user_id'
       AND NOT client_column.attisdropped
      JOIN pg_attribute decline_column
        ON decline_column.attrelid = index_definition.indrelid
       AND decline_column.attname = 'decline_idempotency_key'
       AND NOT decline_column.attisdropped
      WHERE namespace_row.nspname = 'public'
        AND index_row.relname = 'trainer_plan_assignments_decline_idempotency_unique'
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
    )
  THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_PREFLIGHT_FAILED';
  END IF;

  IF to_regprocedure('public.assign_trainer_program(uuid,uuid,text,text)') IS NULL
    OR to_regprocedure('public.remove_trainer_assignment(uuid)') IS NULL
    OR to_regprocedure('public.create_manual_plan_atomic(jsonb,jsonb,boolean)') IS NULL
    OR to_regprocedure('public.create_engine_plan_v2(jsonb,jsonb,integer,text,uuid,uuid,jsonb)') IS NULL
    OR EXISTS (
      SELECT 1 FROM pg_proc procedure JOIN pg_roles owner_role ON owner_role.oid=procedure.proowner
      WHERE procedure.oid IN (
        'public.create_manual_plan_atomic(jsonb,jsonb,boolean)'::regprocedure,
        'public.create_engine_plan_v2(jsonb,jsonb,integer,text,uuid,uuid,jsonb)'::regprocedure
      ) AND (procedure.prosecdef OR owner_role.rolname<>'postgres'
        OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=public']::TEXT[])
    )
    OR has_function_privilege('anon','public.assign_trainer_program(uuid,uuid,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.remove_trainer_assignment(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.assign_trainer_program(uuid,uuid,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.remove_trainer_assignment(uuid)','EXECUTE')
    OR EXISTS (
      SELECT 1 FROM pg_proc procedure JOIN pg_roles owner_role ON owner_role.oid=procedure.proowner
      WHERE procedure.oid IN ('public.assign_trainer_program(uuid,uuid,text,text)'::regprocedure,'public.remove_trainer_assignment(uuid)'::regprocedure)
        AND (NOT procedure.prosecdef OR owner_role.rolname<>'postgres' OR procedure.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::TEXT[])
    )
    OR EXISTS (
      SELECT 1 FROM pg_proc procedure
      CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl,acldefault('f',procedure.proowner))) permission
      LEFT JOIN pg_roles grantee ON grantee.oid=permission.grantee
      WHERE procedure.oid IN ('public.assign_trainer_program(uuid,uuid,text,text)'::regprocedure,'public.remove_trainer_assignment(uuid)'::regprocedure)
        AND permission.grantee<>procedure.proowner
        AND (permission.is_grantable OR permission.grantee=0 OR grantee.rolname IS NULL OR grantee.rolname NOT IN ('authenticated','service_role'))
    )
    OR has_table_privilege('authenticated','private.trainer_assignment_requests','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('anon','private.trainer_assignment_requests','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated','private.trainer_plan_selection_periods','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('anon','private.trainer_plan_selection_periods','SELECT,INSERT,UPDATE,DELETE')
    OR has_function_privilege('authenticated','private.trainer_assignment_selection_windows(uuid,date,date,text)','EXECUTE')
    OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.workout_plans'::regclass AND tgname='trg_track_trainer_plan_selection' AND tgenabled='O' AND NOT tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_proc WHERE oid IN ('public.guard_plan_lifecycle_mutation()'::regprocedure,'public.enforce_plan_family_limit()'::regprocedure) AND prosecdef)
    OR to_regclass('public.trainer_assignments_retained_template_unique') IS NULL
    OR to_regclass('public.trainer_plan_assignments_one_active_client') IS NOT NULL THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_PREFLIGHT_FAILED';
  END IF;
  IF to_regprocedure('public.get_coach_relationship_management()') IS NULL THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_PREFLIGHT_FAILED';
  END IF;
  IF NOT has_function_privilege('authenticated','public.get_coach_relationship_management()','EXECUTE')
    OR has_function_privilege('anon','public.get_coach_relationship_management()','EXECUTE')
    OR has_function_privilege('service_role','public.get_coach_relationship_management()','EXECUTE')
    OR EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_roles owner_role ON owner_role.oid=p.proowner
      WHERE p.oid='public.get_coach_relationship_management()'::regprocedure
        AND (p.prorettype<>'jsonb'::regtype OR NOT p.prosecdef OR owner_role.rolname<>'postgres'
          OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[])
    )
    OR EXISTS (
      SELECT 1 FROM pg_proc p
      CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) permission
      LEFT JOIN pg_roles grantee ON grantee.oid=permission.grantee
      WHERE p.oid='public.get_coach_relationship_management()'::regprocedure
        AND permission.grantee<>p.proowner
        AND (permission.is_grantable OR permission.grantee=0 OR grantee.rolname IS DISTINCT FROM 'authenticated')
    ) THEN
    RAISE EXCEPTION 'TRAINER_SECURITY_PREFLIGHT_FAILED';
  END IF;
  RETURN 61;
END;
$_$;
ALTER FUNCTION public.trainer_security_preflight() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trainer_security_preflight() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.trainer_security_preflight() TO authenticated,service_role;
