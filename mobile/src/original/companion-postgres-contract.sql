DO $$ BEGIN
  IF to_regprocedure('public.get_companion_state()') IS NULL THEN
    RAISE EXCEPTION 'Companion contract missing: get_companion_state must exist';
  END IF;
END $$;

INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','companion-a@example.invalid'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','companion-b@example.invalid'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','companion-c@example.invalid'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','companion-d@example.invalid');
INSERT INTO public.profiles(id,full_name,timezone,days_per_week) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Persona A','UTC',3),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Persona B','UTC',3),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Persona C','UTC',3),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Persona D','UTC',3);

CREATE FUNCTION pg_temp.expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'Expected error %, statement succeeded', expected;
EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE expected || '%' THEN RAISE; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT pg_temp.expect_error('SELECT public.get_companion_state()','COMPANION_AUTH_REQUIRED');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$ DECLARE state jsonb; first_code jsonb; BEGIN
  state := public.get_companion_state();
  IF state->>'status' <> 'none' OR state->'partner' <> 'null'::jsonb THEN RAISE EXCEPTION 'Fresh account leaked relationship data'; END IF;
  first_code := public.get_companion_invite_code();
  IF first_code IS DISTINCT FROM public.get_companion_invite_code() THEN RAISE EXCEPTION 'Opening code rotated an unexpired invitation'; END IF;
  IF first_code->>'code' !~ '^VKR-[A-F0-9]{12}$' OR (first_code->>'expiresAt')::timestamptz NOT BETWEEN now()+interval '6 days 23 hours' AND now()+interval '7 days 1 minute' THEN RAISE EXCEPTION 'Code expiry/format invalid'; END IF;
  PERFORM pg_temp.expect_error(format('SELECT public.preview_companion_invite_code(%L)',first_code->>'code'),'COMPANION_SELF');
END $$;
SELECT pg_temp.expect_error('SELECT public.preview_companion_invite_code(''VKR-000000000000'')','COMPANION_CODE_UNAVAILABLE');
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT set_config('companion.test_code',public.get_companion_invite_code()->>'code',false);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$ DECLARE state jsonb; preview jsonb; BEGIN
  preview := public.preview_companion_invite_code(current_setting('companion.test_code'));
  IF preview#>>'{person,userId}' <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' OR preview::text LIKE '%days_per_week%' THEN RAISE EXCEPTION 'Invitation preview shape/privacy failed'; END IF;
  state := public.request_companion(current_setting('companion.test_code'));
  PERFORM set_config('companion.test_relationship',state#>>'{relationship,id}',false);
  IF state->>'status' <> 'pending_outgoing' OR state->'partner' <> 'null'::jsonb THEN RAISE EXCEPTION 'Pending invitation exposed summary'; END IF;
  IF public.request_companion(current_setting('companion.test_code'))#>>'{relationship,id}' <> state#>>'{relationship,id}' THEN RAISE EXCEPTION 'Retry duplicated invitation'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT pg_temp.expect_error(format('SELECT public.request_companion(%L)',current_setting('companion.test_code')),'COMPANION_BUSY');
SELECT pg_temp.expect_error(format('SELECT public.respond_companion(%L,true)',current_setting('companion.test_relationship')),'COMPANION_NOT_ALLOWED');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_temp.expect_error(format('SELECT public.respond_companion(%L,true)',current_setting('companion.test_relationship')),'COMPANION_NOT_ALLOWED');
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $$ DECLARE state jsonb; BEGIN
  state := public.get_companion_state();
  IF state->>'status' <> 'pending_incoming' OR state->'partner' <> 'null'::jsonb THEN RAISE EXCEPTION 'Incoming state incorrect'; END IF;
  state := public.respond_companion(current_setting('companion.test_relationship')::uuid,true);
  IF state->>'status' <> 'active' OR state->'partner' = 'null'::jsonb THEN RAISE EXCEPTION 'Acceptance did not activate both summaries'; END IF;
END $$;
RESET ROLE;

-- Web rows plus a copied row and an Android-only row. Malformed and foreign entries must be ignored.
INSERT INTO public.progress_logs(id,user_id,client_session_id,completed_at) VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-2222-4333-8444-111111111111',now()-interval '1 minute'),
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-2222-4333-8444-111111111111',now());
INSERT INTO public.original_app_snapshots(user_id,revision,updated_at,payload) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gen_random_uuid(),now(),jsonb_build_object(
 'version',1,'accountId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','remoteUserId','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'tables',jsonb_build_object(
  'profiles',jsonb_build_array(jsonb_build_object('id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','timezone','UTC','days_per_week',4,'updated_at',now()+interval '1 second')),
  'workout_plans','not an array',
  'progress_logs',jsonb_build_array(
   jsonb_build_object('id','11111111-1111-4111-8111-111111111111','user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','client_session_id','11111111-2222-4333-8444-111111111111','completed_at',now()-interval '1 minute'),
   jsonb_build_object('id','22222222-2222-4222-8222-222222222222','user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','client_session_id','22222222-2222-4333-8444-111111111111','completed_at',now(),'mobile_session_payload',jsonb_build_object('secret','must not be returned')),
   jsonb_build_object('id','44444444-4444-4444-8444-444444444444','user_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','completed_at',now()),
   jsonb_build_object('id','55555555-5555-4555-8555-555555555555','user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','completed_at','not-a-date')))));
SET ROLE authenticated;
DO $$ DECLARE state jsonb; BEGIN
  state := public.get_companion_state();
  IF state#>>'{partner,completedSessions}' <> '3' OR state#>>'{partner,goal}' <> '4' THEN RAISE EXCEPTION 'Web/Android union or recent profile goal failed: %',state; END IF;
  IF state::text ~ 'secret|mobile_session_payload|workout_plans|readiness|injuries' THEN RAISE EXCEPTION 'Summary leaked private details'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_temp.expect_error(format('SELECT public.send_companion_greeting(%L,%L,%L)',current_setting('companion.test_relationship'),repeat('a',121),'90000000-0000-4000-8000-000000000001'),'COMPANION_MESSAGE_INVALID');
DO $$ DECLARE state jsonb; BEGIN
  state := public.send_companion_greeting(current_setting('companion.test_relationship')::uuid,repeat('💪',120),'90000000-0000-4000-8000-000000000001');
  IF state#>>'{greeting,message}' <> repeat('💪',120) OR state->>'nextGreetingAt' IS NULL THEN RAISE EXCEPTION 'Unicode 120 or quota response incorrect'; END IF;
  PERFORM public.send_companion_greeting(current_setting('companion.test_relationship')::uuid,repeat('💪',120),'90000000-0000-4000-8000-000000000001');
END $$;
SELECT pg_temp.expect_error(format('SELECT public.send_companion_greeting(%L,''changed'',%L)',current_setting('companion.test_relationship'),'90000000-0000-4000-8000-000000000001'),'COMPANION_IDEMPOTENCY_MISMATCH');
SELECT pg_temp.expect_error(format('SELECT public.send_companion_greeting(%L,''another'',%L)',current_setting('companion.test_relationship'),'90000000-0000-4000-8000-000000000002'),'COMPANION_DAILY_LIMIT');
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.product_notifications WHERE type='companion_greeting') <> 1 THEN RAISE EXCEPTION 'Greeting retry duplicated notice'; END IF;
  IF public.send_companion_greeting(current_setting('companion.test_relationship')::uuid,E' \n\t ','90000000-0000-4000-8000-000000000003')#>>'{greeting,message}' <> '👏 ¡Bien hecho!' THEN RAISE EXCEPTION 'Whitespace did not use default greeting'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT pg_temp.expect_error(format('SELECT public.send_companion_greeting(%L,''Hi'',%L)',current_setting('companion.test_relationship'),'90000000-0000-4000-8000-000000000004'),'COMPANION_NOT_ALLOWED');
SELECT pg_temp.expect_error(format('SELECT public.leave_companion(%L)',current_setting('companion.test_relationship')),'COMPANION_NOT_ALLOWED');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT public.leave_companion(current_setting('companion.test_relationship')::uuid);
DO $$ DECLARE state jsonb; BEGIN
  state := public.get_companion_state();
  IF state->>'status' <> 'none' OR state->'partner' <> 'null'::jsonb OR state->'greeting' <> 'null'::jsonb OR state->>'nextGreetingAt' IS NULL THEN RAISE EXCEPTION 'Unlink leaked old companion/greeting or reset daily quota'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('companion.test_code',public.get_companion_invite_code()->>'code',false);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT set_config('companion.test_relationship_2',public.request_companion(current_setting('companion.test_code'))#>>'{relationship,id}',false);
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT public.respond_companion(current_setting('companion.test_relationship_2')::uuid,true);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$ DECLARE state jsonb; BEGIN
  state := public.get_companion_state();
  IF state->'greeting' <> 'null'::jsonb OR state->>'nextGreetingAt' IS NULL THEN RAISE EXCEPTION 'New companion saw old greeting or bypassed quota'; END IF;
END $$;
SELECT pg_temp.expect_error(format('SELECT public.send_companion_greeting(%L,''new peer'',%L)',current_setting('companion.test_relationship_2'),'90000000-0000-4000-8000-000000000005'),'COMPANION_DAILY_LIMIT');
SELECT public.leave_companion(current_setting('companion.test_relationship_2')::uuid);
RESET ROLE;

-- Loading a fresh account must not create a code, relationship, receipt or notice.
SELECT set_config('companion.before_counts',jsonb_build_array(
 (SELECT count(*) FROM private.companion_invite_codes),(SELECT count(*) FROM private.companion_relationships),
 (SELECT count(*) FROM private.companion_greetings),(SELECT count(*) FROM public.product_notifications))::text,false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT public.get_companion_state();
SELECT public.get_companion_state();
SELECT pg_temp.expect_error('SELECT * FROM private.companion_memberships','permission denied');
SELECT pg_temp.expect_error('SELECT private.companion_summary(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'')','permission denied');
RESET ROLE;
DO $$ BEGIN
 IF current_setting('companion.before_counts')::jsonb IS DISTINCT FROM jsonb_build_array(
   (SELECT count(*) FROM private.companion_invite_codes),(SELECT count(*) FROM private.companion_relationships),
   (SELECT count(*) FROM private.companion_greetings),(SELECT count(*) FROM public.product_notifications)) THEN RAISE EXCEPTION 'Read-only state wrote data'; END IF;
END $$;

-- Expiration hides summaries immediately, then a mutation frees stale slots and
-- archives just the resolved invitation. Cancellation and rejection are retryable.
SET ROLE authenticated;
SELECT set_config('companion.test_code_d',public.get_companion_invite_code()->>'code',false);
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('companion.expired_relationship',public.request_companion(lower(current_setting('companion.test_code_d')))#>>'{relationship,id}',false);
RESET ROLE;
UPDATE private.companion_relationships SET expires_at=now()-interval '1 second' WHERE id=current_setting('companion.expired_relationship')::uuid;
UPDATE private.companion_invite_codes SET expires_at=now()-interval '1 second' WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
DO $$ BEGIN IF public.get_companion_state()->>'status'<>'none' THEN RAISE EXCEPTION 'Expired invitation still visible'; END IF; END $$;
SELECT pg_temp.expect_error(format('SELECT public.respond_companion(%L,true)',current_setting('companion.expired_relationship')),'COMPANION_INVITATION_EXPIRED');
SELECT set_config('companion.new_code_d',public.get_companion_invite_code()->>'code',false);
DO $$ BEGIN
 IF current_setting('companion.new_code_d')=current_setting('companion.test_code_d') THEN RAISE EXCEPTION 'Expired code was reused'; END IF;
 IF EXISTS(SELECT FROM public.product_notifications WHERE type='companion_invitation' AND (read_at IS NULL OR dismissed_at IS NULL)) THEN RAISE EXCEPTION 'Expired invitation notification remained unread'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT pg_temp.expect_error(format('SELECT public.preview_companion_invite_code(%L)',current_setting('companion.test_code_d')),'COMPANION_CODE_UNAVAILABLE');
SELECT set_config('companion.declined_relationship',public.request_companion(current_setting('companion.new_code_d'))#>>'{relationship,id}',false);
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.product_notifications WHERE type='companion_invitation')<>1 OR NOT EXISTS(SELECT FROM public.product_notifications WHERE type='companion_invitation' AND read_at IS NULL AND dismissed_at IS NULL) THEN RAISE EXCEPTION 'New invitation did not reuse and reopen its slot'; END IF;
END $$;
SELECT public.respond_companion(current_setting('companion.declined_relationship')::uuid,false);
SELECT public.respond_companion(current_setting('companion.declined_relationship')::uuid,false);
DO $$ BEGIN IF EXISTS(SELECT FROM public.product_notifications WHERE type='companion_invitation' AND (read_at IS NULL OR dismissed_at IS NULL)) THEN RAISE EXCEPTION 'Rejected invitation notice not resolved'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('companion.cancel_relationship',public.request_companion(current_setting('companion.new_code_d'))#>>'{relationship,id}',false);
SELECT public.cancel_companion_request(current_setting('companion.cancel_relationship')::uuid);
SELECT public.cancel_companion_request(current_setting('companion.cancel_relationship')::uuid);
SELECT set_config('companion.cd_relationship',public.request_companion(current_setting('companion.new_code_d'))#>>'{relationship,id}',false);
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT public.respond_companion(current_setting('companion.cd_relationship')::uuid,true);
DO $$ BEGIN IF EXISTS(SELECT FROM public.product_notifications WHERE type='companion_invitation' AND (read_at IS NULL OR dismissed_at IS NULL)) THEN RAISE EXCEPTION 'Accepted invitation notice not resolved'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT FROM private.companion_relationships WHERE id=ANY(ARRAY[current_setting('companion.expired_relationship')::uuid,current_setting('companion.declined_relationship')::uuid,current_setting('companion.cancel_relationship')::uuid])) THEN RAISE EXCEPTION 'Closed relationship history accumulated'; END IF;
END $$;

-- A missing goal remains missing. Weekly boundaries use the member's timezone,
-- including the exact start instant, and never include a future completion.
UPDATE public.profiles SET days_per_week=NULL,timezone='Pacific/Kiritimati' WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
INSERT INTO public.progress_logs(id,user_id,completed_at) VALUES
 ('60000000-0000-4000-8000-000000000001','dddddddd-dddd-4ddd-8ddd-dddddddddddd',date_trunc('week',now() AT TIME ZONE 'Pacific/Kiritimati') AT TIME ZONE 'Pacific/Kiritimati'),
 ('60000000-0000-4000-8000-000000000002','dddddddd-dddd-4ddd-8ddd-dddddddddddd',(date_trunc('week',now() AT TIME ZONE 'Pacific/Kiritimati') AT TIME ZONE 'Pacific/Kiritimati')-interval '1 microsecond'),
 ('60000000-0000-4000-8000-000000000003','dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+interval '1 day');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
DO $$ DECLARE state jsonb; BEGIN
 state:=public.get_companion_state();
 IF state#>'{partner,goal}'<>'null'::jsonb OR state#>>'{partner,completedSessions}'<>'1' OR state#>>'{partner,timeZone}'<>'Pacific/Kiritimati'
  OR (state#>>'{partner,weekEnd}')::date-(state#>>'{partner,weekStart}')::date<>6 THEN RAISE EXCEPTION 'Nullable goal or local week boundary incorrect: %',state; END IF;
END $$;

-- One latest sender receipt and one recipient/type notification survive repeated
-- days. NFC/JS whitespace parity, literal HTML, retry immutability and read reset.
SELECT public.send_companion_greeting(current_setting('companion.cd_relationship')::uuid,U&'\FEFFe\0301\00A0','90000000-0000-4000-8000-000000000006');
DO $$ BEGIN IF public.get_companion_state()#>>'{greeting,message}'<>'é' THEN RAISE EXCEPTION 'NFC or Unicode trim mismatch'; END IF; END $$;
RESET ROLE;
UPDATE private.companion_greetings SET sent_day=(now() AT TIME ZONE 'UTC')::date-1,sent_at=now()-interval '1 day' WHERE sender_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SELECT set_config('companion.previous_notice_id',(SELECT id::text FROM public.product_notifications WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' AND type='companion_greeting'),false);
UPDATE public.product_notifications SET read_at=now(),dismissed_at=now() WHERE user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd' AND type='companion_greeting';
INSERT INTO public.product_notifications(user_id,type,title,body,dedupe_key) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','system','Independent','Keep this notification','companion-contract-independent');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
DO $$ BEGIN IF public.get_companion_state()->'greeting'<>'null'::jsonb OR public.get_companion_state()->'nextGreetingAt'<>'null'::jsonb THEN RAISE EXCEPTION 'Previous-day receipt blocked today'; END IF; END $$;
SELECT public.send_companion_greeting(current_setting('companion.cd_relationship')::uuid,'<b>Ánimo</b>','90000000-0000-4000-8000-000000000007');
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.product_notifications WHERE type='companion_greeting')<>1 OR NOT EXISTS(SELECT FROM public.product_notifications WHERE type='companion_greeting' AND body='<b>Ánimo</b>' AND read_at IS NULL AND dismissed_at IS NULL) THEN RAISE EXCEPTION 'Greeting history accumulated or text/read reset changed'; END IF;
 IF EXISTS(SELECT FROM public.product_notifications WHERE id=current_setting('companion.previous_notice_id')::uuid) THEN RAISE EXCEPTION 'New greeting reused dismissed event identity'; END IF;
 IF NOT EXISTS(SELECT FROM public.product_notifications WHERE dedupe_key='companion-contract-independent' AND read_at IS NULL AND dismissed_at IS NULL) THEN RAISE EXCEPTION 'Companion RPC changed unrelated notification'; END IF;
END $$;
SELECT set_config('companion.current_notice_id',(SELECT id::text FROM public.product_notifications WHERE type='companion_greeting'),false);
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT public.send_companion_greeting(current_setting('companion.cd_relationship')::uuid,'<b>Ánimo</b>','90000000-0000-4000-8000-000000000007');
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM public.product_notifications WHERE id=current_setting('companion.current_notice_id')::uuid) THEN RAISE EXCEPTION 'Idempotent retry changed notification identity'; END IF;
 UPDATE public.product_notifications SET read_at=now() WHERE id=current_setting('companion.previous_notice_id')::uuid;
 IF EXISTS(SELECT FROM public.product_notifications WHERE id=current_setting('companion.current_notice_id')::uuid AND read_at IS NOT NULL) THEN RAISE EXCEPTION 'Late read changed new greeting'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM private.companion_greetings WHERE sender_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc')<>1 THEN RAISE EXCEPTION 'Daily receipt history accumulated'; END IF; END $$;

-- The newest version of each plan controls activation and its goal. Profile-only
-- edits do not replace the active plan target; malformed backup arrays are safe.
INSERT INTO public.workout_plans(id,user_id,name,days_per_week,is_active,updated_at) VALUES('70000000-0000-4000-8000-000000000001','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Canonical target',5,true,now());
UPDATE public.original_app_snapshots SET payload=jsonb_set(payload,'{tables,workout_plans}',jsonb_build_array(jsonb_build_object(
 'id','70000000-0000-4000-8000-000000000001','user_id','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','days_per_week',6,'is_active',true,'updated_at',now()+interval '1 minute'))) WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$ BEGIN IF private.companion_summary('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'goal'<>'6' THEN RAISE EXCEPTION 'Latest Android plan goal ignored'; END IF; END $$;
UPDATE public.original_app_snapshots SET payload=jsonb_set(payload,'{tables,workout_plans,0,is_active}','false') WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$ BEGIN IF private.companion_summary('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'goal'<>'4' THEN RAISE EXCEPTION 'Old canonical plan resurrected'; END IF; END $$;
UPDATE public.original_app_snapshots SET payload=jsonb_set(jsonb_set(payload,'{tables,workout_plans,0,updated_at}',to_jsonb(now()-interval '1 day')),'{tables,progress_logs}','{}') WHERE user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$ DECLARE summary jsonb; BEGIN
 summary:=private.companion_summary('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF summary->>'goal'<>'5' OR summary->>'completedSessions'<>'2' THEN RAISE EXCEPTION 'Canonical plan or malformed progress handling incorrect: %',summary; END IF;
END $$;

-- Suspended accounts cannot act; their private training summaries stop being
-- visible to the companion, and greetings cannot be delivered to them.
SELECT set_config('request.jwt.claim.role','service_role',false);
UPDATE public.profiles SET account_status='suspended',suspended_until=now()+interval '1 day' WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SELECT set_config('request.jwt.claim.role','authenticated',false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false);
SELECT pg_temp.expect_error('SELECT public.get_companion_state()','COMPANION_AUTH_REQUIRED');
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
DO $$ BEGIN IF public.get_companion_state()->'partner'<>'null'::jsonb THEN RAISE EXCEPTION 'Suspended account summary still exposed'; END IF; END $$;
SELECT pg_temp.expect_error(format('SELECT public.send_companion_greeting(%L,''Hi'',%L)',current_setting('companion.cd_relationship'),'90000000-0000-4000-8000-000000000008'),'COMPANION_UNAVAILABLE');
SELECT public.leave_companion(current_setting('companion.cd_relationship')::uuid);
RESET ROLE;
SELECT set_config('request.jwt.claim.role','service_role',false);
UPDATE public.profiles SET account_status='active',suspended_until=NULL WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SELECT set_config('request.jwt.claim.role','authenticated',false);

DO $$ DECLARE item record; BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='private' AND tablename LIKE 'companion_%' LOOP
    IF has_table_privilege('authenticated','private.'||item.tablename,'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('anon','private.'||item.tablename,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Direct companion table access granted: %',item.tablename; END IF;
  END LOOP;
  IF has_function_privilege('anon','public.get_companion_state()','EXECUTE') OR has_function_privilege('anon','public.send_companion_greeting(uuid,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous RPC permission'; END IF;
  FOR item IN SELECT p.oid::regprocedure AS signature,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY['get_companion_state','get_companion_invite_code','preview_companion_invite_code','request_companion','respond_companion','cancel_companion_request','leave_companion','send_companion_greeting']) LOOP
    IF NOT item.prosecdef OR NOT ('search_path=""'=ANY(item.proconfig)) OR has_function_privilege('anon',item.signature,'EXECUTE') OR NOT has_function_privilege('authenticated',item.signature,'EXECUTE') THEN RAISE EXCEPTION 'RPC security contract invalid: %',item.signature; END IF;
  END LOOP;
END $$;
