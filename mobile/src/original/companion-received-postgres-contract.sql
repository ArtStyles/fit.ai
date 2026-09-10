-- This contract owns its fixtures and rolls them back before the race tests.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','received-e@example.invalid'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','received-f@example.invalid'),
 ('abababab-abab-4bab-8bab-abababababab','received-g@example.invalid');
INSERT INTO public.profiles(id,full_name,timezone,days_per_week) VALUES
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Persona E','UTC',3),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','Persona F','UTC',3),
 ('abababab-abab-4bab-8bab-abababababab','Persona G','UTC',3);
CREATE FUNCTION pg_temp.expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'Expected error %, statement succeeded', expected;
EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE expected || '%' THEN RAISE; END IF;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
SELECT set_config('companion.received_code',public.get_companion_invite_code()->>'code',true);
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
SELECT set_config('companion.received_relationship',public.request_companion(current_setting('companion.received_code'))#>>'{relationship,id}',true);
SELECT set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
SELECT public.respond_companion(current_setting('companion.received_relationship')::uuid,true);
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.send_companion_greeting(current_setting('companion.received_relationship')::uuid,'Vamos con calma, F','91000000-0000-4000-8000-000000000001');
  PERFORM set_config('companion.e_sent_at',state#>>'{greeting,sentAt}',true);
  PERFORM set_config('companion.e_next_at',state->>'nextGreetingAt',true);
END $$;

-- A receipt belongs to the partner; receiving cannot consume the viewer's send.
SELECT set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.get_companion_state();
  IF state->'receivedGreeting' IS DISTINCT FROM jsonb_build_object('message','Vamos con calma, F','sentAt',current_setting('companion.e_sent_at')::timestamptz) THEN
    RAISE EXCEPTION 'Active partner greeting was not received with its original sentAt: %',state;
  END IF;
  IF state->'greeting' IS DISTINCT FROM 'null'::jsonb OR state->'nextGreetingAt' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Receiving consumed the viewer daily greeting quota'; END IF;
  state:=public.send_companion_greeting(current_setting('companion.received_relationship')::uuid,'Buen esfuerzo, E','91000000-0000-4000-8000-000000000002');
  IF state#>>'{greeting,message}' IS DISTINCT FROM 'Buen esfuerzo, E' OR state#>>'{receivedGreeting,message}' IS DISTINCT FROM 'Vamos con calma, F' THEN RAISE EXCEPTION 'Send response mixed outgoing and received greetings'; END IF;
  PERFORM set_config('companion.f_sent_at',state#>>'{greeting,sentAt}',true);
  PERFORM set_config('companion.f_next_at',state->>'nextGreetingAt',true);
END $$;
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.get_companion_state();
  IF state#>>'{greeting,message}' IS DISTINCT FROM 'Vamos con calma, F' OR state->'receivedGreeting' IS DISTINCT FROM jsonb_build_object('message','Buen esfuerzo, E','sentAt',current_setting('companion.f_sent_at')::timestamptz) THEN RAISE EXCEPTION 'Bidirectional greetings were confused'; END IF;
  IF state->>'nextGreetingAt' IS DISTINCT FROM current_setting('companion.e_next_at') THEN RAISE EXCEPTION 'Received greeting changed sender quota'; END IF;
  state:=public.send_companion_greeting(current_setting('companion.received_relationship')::uuid,'Vamos con calma, F','91000000-0000-4000-8000-000000000001');
  IF state#>>'{greeting,sentAt}' IS DISTINCT FROM current_setting('companion.e_sent_at') OR state#>>'{receivedGreeting,message}' IS DISTINCT FROM 'Buen esfuerzo, E' OR state->>'nextGreetingAt' IS DISTINCT FROM current_setting('companion.e_next_at') THEN RAISE EXCEPTION 'Retry changed own receipt, partner receipt or quota'; END IF;
END $$;
SELECT pg_temp.expect_error('SELECT private.companion_state(''ffffffff-ffff-4fff-8fff-ffffffffffff'')','permission denied');
SELECT pg_temp.expect_error(format('SELECT public.send_companion_greeting(%L,''Again'',%L)',current_setting('companion.received_relationship'),'91000000-0000-4000-8000-000000000003'),'COMPANION_DAILY_LIMIT');

-- A different account never receives a member's snapshot or greeting.
SELECT set_config('request.jwt.claim.sub','abababab-abab-4bab-8bab-abababababab',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.get_companion_state();
  IF state->>'viewerId' IS DISTINCT FROM 'abababab-abab-4bab-8bab-abababababab' OR state->>'status' IS DISTINCT FROM 'none' OR state->'receivedGreeting' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Another account saw the members greeting'; END IF;
END $$;

-- Advancing receipt timestamps across UTC days must retain the incoming message
-- while releasing both own quotas. A later successful send replaces the receipt.
RESET ROLE;
UPDATE private.companion_greetings SET sent_day=(now() AT TIME ZONE 'UTC')::date-2,sent_at=now()-interval '2 days'
 WHERE sender_id IN ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','ffffffff-ffff-4fff-8fff-ffffffffffff');
SELECT set_config('companion.old_sent_at',(now()-interval '2 days')::text,true);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.get_companion_state();
  IF state->'receivedGreeting' IS DISTINCT FROM jsonb_build_object('message','Buen esfuerzo, E','sentAt',current_setting('companion.old_sent_at')::timestamptz) THEN RAISE EXCEPTION 'Past-day received greeting disappeared or lost its original date'; END IF;
  IF state->'greeting' IS DISTINCT FROM 'null'::jsonb OR state->'nextGreetingAt' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Past-day own greeting blocked today'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.send_companion_greeting(current_setting('companion.received_relationship')::uuid,'Otro paso, E','91000000-0000-4000-8000-000000000004');
  IF state#>>'{receivedGreeting,message}' IS DISTINCT FROM 'Vamos con calma, F' THEN RAISE EXCEPTION 'Sending replaced the incoming receipt'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.get_companion_state();
  IF state->'receivedGreeting' IS DISTINCT FROM jsonb_build_object('message','Otro paso, E','sentAt',now()) OR state->'nextGreetingAt' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Latest partner greeting did not replace past receipt independently of own quota'; END IF;
  PERFORM public.send_companion_greeting(current_setting('companion.received_relationship')::uuid,'Sigue así, F','91000000-0000-4000-8000-000000000005');
END $$;

-- Account suspension revokes access to the partner's message immediately.
RESET ROLE;
SELECT set_config('request.jwt.claim.role','service_role',true);
UPDATE public.profiles SET account_status='suspended',suspended_until=now()+interval '1 day' WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff';
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET ROLE authenticated;
DO $$ DECLARE state jsonb; BEGIN
  state:=public.get_companion_state();
  IF state->'receivedGreeting' IS DISTINCT FROM 'null'::jsonb OR state->'partner' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Inactive partner greeting remained visible'; END IF;
  IF state#>>'{greeting,message}' IS DISTINCT FROM 'Sigue así, F' OR state->>'nextGreetingAt' IS DISTINCT FROM current_setting('companion.e_next_at') THEN RAISE EXCEPTION 'Partner suspension changed own greeting or quota'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
SELECT pg_temp.expect_error('SELECT public.get_companion_state()','COMPANION_AUTH_REQUIRED');
RESET ROLE;
SELECT set_config('request.jwt.claim.role','service_role',true);
UPDATE public.profiles SET account_status='active',suspended_until=NULL WHERE id='ffffffff-ffff-4fff-8fff-ffffffffffff';
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
DO $$ BEGIN
  IF public.get_companion_state()#>>'{receivedGreeting,message}' IS DISTINCT FROM 'Otro paso, E' THEN RAISE EXCEPTION 'Suspension destroyed the retained partner receipt'; END IF;
  IF public.leave_companion(current_setting('companion.received_relationship')::uuid)->'receivedGreeting' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Unlink response retained partner greeting'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.get_companion_state();
  IF state->>'status' IS DISTINCT FROM 'none' OR state->'receivedGreeting' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Revoked partner retained greeting'; END IF;
  IF state->>'nextGreetingAt' IS DISTINCT FROM current_setting('companion.f_next_at') THEN RAISE EXCEPTION 'Unlink reset sender quota'; END IF;
END $$;

-- Even re-pairing with the same person creates a new consent boundary.
SELECT set_config('companion.received_code',public.get_companion_invite_code()->>'code',true);
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
SELECT set_config('companion.received_relationship_2',public.request_companion(current_setting('companion.received_code'))#>>'{relationship,id}',true);
DO $$ BEGIN
  IF public.get_companion_state()->'receivedGreeting' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Pending invitation exposed a previous partner receipt'; END IF;
END $$;
-- A persisted receipt referring to an unaccepted relationship still must stay private.
SAVEPOINT pending_receipt;
RESET ROLE;
UPDATE private.companion_greetings SET relationship_id=current_setting('companion.received_relationship_2')::uuid WHERE sender_id='ffffffff-ffff-4fff-8fff-ffffffffffff';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.get_companion_state()->'receivedGreeting' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Unaccepted relationship exposed its stored greeting'; END IF;
END $$;
ROLLBACK TO SAVEPOINT pending_receipt;
SELECT set_config('request.jwt.claim.sub','ffffffff-ffff-4fff-8fff-ffffffffffff',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.respond_companion(current_setting('companion.received_relationship_2')::uuid,true);
  IF state->'receivedGreeting' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Acceptance resurrected a prior relationship receipt'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.get_companion_state();
  IF state->'receivedGreeting' IS DISTINCT FROM 'null'::jsonb OR state->'greeting' IS DISTINCT FROM 'null'::jsonb OR state->>'nextGreetingAt' IS DISTINCT FROM current_setting('companion.e_next_at') THEN RAISE EXCEPTION 'Re-pairing reused old messages or bypassed sender quota'; END IF;
END $$;
SELECT public.leave_companion(current_setting('companion.received_relationship_2')::uuid);

-- A different current partner must not inherit the earlier partner's message.
SELECT set_config('request.jwt.claim.sub','abababab-abab-4bab-8bab-abababababab',true);
SELECT set_config('companion.received_code',public.get_companion_invite_code()->>'code',true);
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
SELECT set_config('companion.received_relationship_3',public.request_companion(current_setting('companion.received_code'))#>>'{relationship,id}',true);
SELECT set_config('request.jwt.claim.sub','abababab-abab-4bab-8bab-abababababab',true);
DO $$ DECLARE state jsonb; BEGIN
  state:=public.respond_companion(current_setting('companion.received_relationship_3')::uuid,true);
  IF state->'receivedGreeting' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Different companion inherited former relationship message'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
DO $$ BEGIN
  IF public.get_companion_state()->'receivedGreeting' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Previous partner message leaked into a new pairing'; END IF;
END $$;
ROLLBACK;
