\set ON_ERROR_STOP on
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
DO $$
DECLARE
  owner_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  plan_id uuid := '11111111-1111-4111-8111-111111111111';
  workout_id uuid := '22222222-2222-4222-8222-222222222222';
  session_id uuid := '33333333-3333-4333-8333-333333333333';
  op_id uuid := '44444444-4444-4444-8444-444444444444';
  prescription jsonb := '{"id":"55555555-5555-4555-8555-555555555555","exerciseId":"squat","name":"Sentadilla","imageUrl":null,"instructions":"","sets":1,"reps":8,"durationSeconds":null,"restSeconds":60,"weightKg":10,"targetRpe":7}';
  plan jsonb; session_value jsonb; result_id uuid;
BEGIN
  plan := jsonb_build_object('id',plan_id,'accountId',owner_id,'remoteId',null,'source','personal','name','Plan','notes','','createdAt','2026-09-01T00:00:00Z','updatedAt','2026-09-01T00:00:00Z', 'workouts',jsonb_build_array(jsonb_build_object('id',workout_id,'name','Día uno','dayOfWeek',1,'exercises',jsonb_build_array(prescription))));
  SELECT operation_id INTO result_id FROM public.mobile_sync_push_v1(op_id,'plan',plan_id,plan,'2026-09-01');
  IF result_id <> op_id THEN RAISE EXCEPTION 'wrong receipt'; END IF;
  PERFORM public.mobile_sync_push_v1(op_id,'plan',plan_id,plan,'2026-09-01');
  IF (SELECT count(*) FROM public.mobile_sync_operations) <> 1 THEN RAISE EXCEPTION 'duplicate receipt'; END IF;
  BEGIN
    PERFORM public.mobile_sync_push_v1(op_id,'plan',plan_id,plan || '{"name":"altered"}', '2026-09-01');
    RAISE EXCEPTION 'accepted mutation';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_IDEMPOTENCY_MISMATCH' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'plan',plan_id,jsonb_set(plan,'{accountId}','"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"'),'2026-09-01');
    RAISE EXCEPTION 'accepted wrong owner';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_OWNER_MISMATCH' THEN RAISE; END IF; END;
  session_value := jsonb_build_object('id',session_id,'accountId',owner_id,'remoteId',null,'planId',plan_id,'workoutId',workout_id,'workoutName','Día uno','source','personal','startedAt','2026-09-01T10:00:00Z','finishedAt','2026-09-01T10:30:00Z','rpe',7,'notes','','exercises',jsonb_build_array(jsonb_build_object('prescription',prescription,'sets',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'reps',8,'weightKg',10,'durationSeconds',null,'completed',true)))));
  PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'session',session_id,session_value,'2026-09-01T10:30:00Z');
  BEGIN
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'session',gen_random_uuid(),jsonb_set(session_value,'{id}',to_jsonb(gen_random_uuid())),'2026-09-01');
    RAISE EXCEPTION 'accepted mismatched entity';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_OWNER_MISMATCH' THEN RAISE; END IF; END;
  BEGIN
    session_value := jsonb_set(session_value,'{exercises,0,prescription,sets}','20');
    PERFORM public.mobile_sync_push_v1(gen_random_uuid(),'session',session_id,session_value,'2026-09-01');
    RAISE EXCEPTION 'accepted changed prescription';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'MOBILE_SYNC_CANONICAL_MISMATCH' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM public.mobile_sync_entities) <> 2 THEN RAISE EXCEPTION 'failed operation leaked data'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.mobile_sync_entities) <> 0 THEN RAISE EXCEPTION 'RLS leaked another owner'; END IF;
  BEGIN
    INSERT INTO public.mobile_sync_entities(user_id, kind, entity_id, payload, client_updated_at) VALUES(auth.uid(),'profile',auth.uid(),'{}',now());
    RAISE EXCEPTION 'direct insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'mobile cloud SQL contracts passed' AS result;
