-- phase: seed
-- Baseline delivery uses an administrative connection only because its API-role
-- failure is tested separately. Session creation and all report reads use API roles.
BEGIN;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','59500000-0000-4000-8000-000000000001',true);
SELECT assignment_id AS aid,workout_plan_id AS pid FROM propose_trainer_assignment('59500000-0000-4000-8000-000000000041','59500000-0000-4000-8000-000000000061',NULL,'history-active') \gset
SELECT set_config('request.jwt.claim.sub','59500000-0000-4000-8000-000000000002',true);
SELECT * FROM accept_trainer_assignment(:'aid','history-active-accept');
SELECT id AS wid FROM workouts WHERE plan_id=:'pid' \gset
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT authorize_session_start('59500000-0000-4000-8000-000000000095',:'wid');
SELECT * FROM save_session_log_atomic_v3('59500000-0000-4000-8000-000000000095',:'wid',now(),30,4,'[{"exercise_id":"59500000-0000-4000-8000-000000000051","sets_completed":3,"reps_completed":[8,8,8],"weights_kg":[20,20,20],"rpe_values":[7,7,7],"skip_reason":null}]','{"version":1,"prs":[],"progressions":[]}');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claim.sub','59500000-0000-4000-8000-000000000001',true);
SELECT * FROM publish_trainer_assignment_revision(:'aid','59500000-0000-4000-8000-000000000061','Accepted legacy revision','history-active-revision');
UPDATE trainer_plan_assignments SET accepted_at=now()-interval '15 days' WHERE id=:'aid';
UPDATE trainer_assignment_versions SET effective_from=now()-interval '15 days' WHERE assignment_id=:'aid' AND version_number=1;

SELECT assignment_id AS frozen_aid,workout_plan_id AS frozen_pid FROM propose_trainer_assignment('59500000-0000-4000-8000-000000000042','59500000-0000-4000-8000-000000000061',NULL,'history-frozen') \gset
SELECT set_config('request.jwt.claim.sub','59500000-0000-4000-8000-000000000003',true);
SELECT * FROM accept_trainer_assignment(:'frozen_aid','history-frozen-accept');
SELECT id AS frozen_wid FROM workouts WHERE plan_id=:'frozen_pid' \gset
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT authorize_session_start('59500000-0000-4000-8000-000000000096',:'frozen_wid');
SELECT * FROM save_session_log_atomic_v3('59500000-0000-4000-8000-000000000096',:'frozen_wid',now(),30,4,'[{"exercise_id":"59500000-0000-4000-8000-000000000051","sets_completed":3,"reps_completed":[8,8,8],"weights_kg":[20,20,20],"rpe_values":[7,7,7],"skip_reason":null}]','{"version":1,"prs":[],"progressions":[]}');
RESET ROLE;
RESET SESSION AUTHORIZATION;
SELECT set_config('request.jwt.claim.sub','59500000-0000-4000-8000-000000000001',true);
SELECT * FROM publish_trainer_assignment_revision(:'frozen_aid','59500000-0000-4000-8000-000000000061','Frozen legacy revision','history-frozen-revision');
UPDATE trainer_plan_assignments SET accepted_at=now()-interval '15 days' WHERE id=:'frozen_aid';
UPDATE trainer_assignment_versions SET effective_from=now()-interval '15 days' WHERE assignment_id=:'frozen_aid' AND version_number=1;
UPDATE coaching_relationships SET status='paused_by_platform',paused_at=now() WHERE id='59500000-0000-4000-8000-000000000042';
-- A retained frozen assignment with active report authority: no new acceptance.
UPDATE coaching_relationships SET status='active',paused_at=NULL WHERE id='59500000-0000-4000-8000-000000000042';
SELECT * FROM propose_trainer_assignment('59500000-0000-4000-8000-000000000042','59500000-0000-4000-8000-000000000062',NULL,'history-pending');
COMMIT;

-- phase: read
BEGIN;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','59500000-0000-4000-8000-000000000001',true);
SELECT 'HISTORY:'||jsonb_build_object(
  'sessionUser',session_user,'currentUser',current_user,'now',now(),
  'rangeStart',(now() at time zone 'America/Havana')::date-20,
  'rangeEnd',(now() at time zone 'America/Havana')::date,
  'detail',get_coach_client_insights('59500000-0000-4000-8000-000000000002',(now() at time zone 'America/Havana')::date-20,(now() at time zone 'America/Havana')::date),
  'frozen',get_coach_client_insights('59500000-0000-4000-8000-000000000003',(now() at time zone 'America/Havana')::date-20,(now() at time zone 'America/Havana')::date),
  'summary',get_coach_clients_summary())::text;
ROLLBACK;

-- phase: migrated
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path=public,extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods),4,'initial backfill retains both accepted versions for active and frozen assignments');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods WHERE ended_at IS NOT NULL),2,'both superseded legacy periods are closed');
SELECT ok((SELECT bool_and(period.started_at=greatest(v.effective_from,a.accepted_at) AND period.ended_at IS NOT DISTINCT FROM v.effective_to) FROM private.trainer_plan_selection_periods period JOIN workout_plans p ON p.id=period.plan_id JOIN trainer_assignment_versions v ON v.id=p.trainer_assignment_version_id JOIN trainer_plan_assignments a ON a.id=v.assignment_id),'backfill uses exact accepted version boundaries');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods period JOIN workout_plans p ON p.id=period.plan_id JOIN trainer_plan_assignments a ON a.id=p.trainer_assignment_id WHERE a.accepted_at IS NULL),0,'unaccepted pending copy has no selected history');
SELECT is((SELECT count(*)::int FROM workout_plans WHERE is_active),2,'backfill preserves both legacy principal choices');
SELECT is((SELECT status FROM trainer_plan_assignments WHERE proposal_idempotency_key='history-frozen'),'frozen','accepted frozen assignment remains frozen');
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','59500000-0000-4000-8000-000000000001',true);
SELECT is(session_user::text,'authenticator','legacy history uses actual API session identity');
SELECT is(current_user::text,'authenticated','legacy history uses actual API role');
SELECT is(jsonb_array_length(get_coach_client_insights('59500000-0000-4000-8000-000000000002',current_date-20,current_date)->'versions'),2,'detail retains active and superseded legacy prescriptions');
SELECT is(jsonb_array_length(get_coach_client_insights('59500000-0000-4000-8000-000000000003',current_date-20,current_date)->'versions'),2,'detail retains frozen and superseded legacy prescriptions');
SELECT is(jsonb_array_length(get_coach_client_insights('59500000-0000-4000-8000-000000000002',current_date-20,current_date)->'sessions'),1,'detail retains trusted pre-migration completion');
SELECT ok((SELECT bool_and(jsonb_array_length(client->'adherenceInput'->'versions')=2 AND jsonb_array_length(client->'adherenceInput'->'sessions')=1) FROM jsonb_array_elements(get_coach_clients_summary()->'clients') client),'summary retains both legacy prescriptions and trusted sessions for both clients');
SELECT throws_ok('SELECT * FROM private.trainer_plan_selection_periods','42501',NULL,'history ledger remains private after backfill');
SELECT * FROM finish();
COMMIT;

-- phase: later_revisions
BEGIN;
SET SESSION AUTHORIZATION authenticator;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claim.sub','59500000-0000-4000-8000-000000000002',true);
SELECT activate_plan_version('59500000-0000-4000-8000-000000000091');
SELECT set_config('request.jwt.claim.sub','59500000-0000-4000-8000-000000000001',true);
SELECT id AS aid FROM trainer_plan_assignments WHERE proposal_idempotency_key='history-active' \gset
SELECT * FROM publish_trainer_assignment_revision(:'aid','59500000-0000-4000-8000-000000000061','Unselected after migration','history-later-v3');
SELECT * FROM publish_trainer_assignment_revision(:'aid','59500000-0000-4000-8000-000000000061','Still unselected after migration','history-later-v4');
SELECT assignment_id AS direct_aid FROM assign_trainer_program('59500000-0000-4000-8000-000000000041','59500000-0000-4000-8000-000000000063',NULL,'history-new-direct') \gset
SELECT * FROM publish_trainer_assignment_revision(:'direct_aid','59500000-0000-4000-8000-000000000063','Never selected revision','history-new-direct-v2');
COMMIT;

-- phase: rerun
SET search_path=public,extensions;
SELECT no_plan();
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods),4,'rerun does not invent post-migration selection windows');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods period JOIN workout_plans p ON p.id=period.plan_id JOIN trainer_assignment_versions v ON v.id=p.trainer_assignment_version_id JOIN trainer_plan_assignments a ON a.id=v.assignment_id WHERE a.proposal_idempotency_key='history-active' AND v.version_number>=3),0,'later unselected revisions of an accepted legacy assignment remain unselected');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods period JOIN workout_plans p ON p.id=period.plan_id JOIN trainer_plan_assignments a ON a.id=p.trainer_assignment_id WHERE a.accepted_at IS NULL),0,'new direct assignment and its unselected revision have no invented history');
SELECT is((SELECT count(*)::int FROM private.trainer_plan_selection_periods WHERE ended_at IS NULL),1,'rerun preserves the frozen principal and the closed active-assignment period');
SELECT ok((SELECT is_active FROM workout_plans WHERE id='59500000-0000-4000-8000-000000000091'),'rerun preserves later personal principal choice');
SELECT * FROM finish();
