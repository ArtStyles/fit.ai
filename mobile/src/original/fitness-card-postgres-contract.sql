DO $$ BEGIN
 IF to_regprocedure('public.get_fitness_card_state()') IS NULL THEN RAISE EXCEPTION 'Fitness card contract missing'; END IF;
END $$;
INSERT INTO auth.users(id,email) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fitness-a@example.invalid'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fitness-b@example.invalid'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','fitness-c@example.invalid');
INSERT INTO public.profiles(id,username,full_name) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fitness_a','A'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','fitness_b','B'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','fitness_c','C');
CREATE FUNCTION pg_temp.expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 EXECUTE statement;
 RAISE EXCEPTION 'Expected error %, statement succeeded',expected;
EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE expected || '%' THEN RAISE; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','',false);
SELECT pg_temp.expect_error('SELECT public.get_fitness_card_state()','FITNESS_CARD_AUTH_REQUIRED');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT public.save_fitness_card('Art A','violet',0);
SELECT pg_temp.expect_error('SELECT public.save_fitness_card(''stale'',''ice'',0)','FITNESS_CARD_CONFLICT');
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT pg_temp.expect_error('SELECT public.get_fitness_card(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'')','FITNESS_CARD_NOT_ALLOWED');
SELECT public.fitness_card_access('request','@fitness_a',NULL);
SELECT set_config('fitness.request',(public.get_fitness_card_state()#>>'{access,0,id}'),false);
SELECT pg_temp.expect_error('SELECT public.get_fitness_card(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'')','FITNESS_CARD_NOT_ALLOWED');
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT pg_temp.expect_error(format('SELECT public.fitness_card_access(''accept'',NULL,%L)',current_setting('fitness.request')),'FITNESS_CARD_NOT_ALLOWED');
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT public.fitness_card_access('accept',NULL,current_setting('fitness.request')::uuid);
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT public.get_fitness_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SELECT set_config('fitness.signal',(SELECT revision::text FROM public.fitness_card_updates WHERE user_id=auth.uid()),false);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT public.fitness_card_access('revoke',NULL,current_setting('fitness.request')::uuid);
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT pg_temp.expect_error('SELECT public.get_fitness_card(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'')','FITNESS_CARD_NOT_ALLOWED');
DO $$ BEGIN
 IF (SELECT revision FROM public.fitness_card_updates WHERE user_id=auth.uid()) <= current_setting('fitness.signal')::bigint THEN RAISE EXCEPTION 'Revoked viewer was not notified'; END IF;
END $$;
SELECT public.fitness_card_access('request','fitness_a',NULL);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT pg_temp.expect_error(format('SELECT public.fitness_card_access(''accept'',NULL,%L)',current_setting('fitness.request')),'FITNESS_CARD_NOT_ALLOWED');
SELECT public.fitness_card_access('share','fitness_b',NULL);
SELECT public.fitness_card_access('share','fitness_c',NULL);
RESET ROLE;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
INSERT INTO storage.objects(bucket_id,name) VALUES('fitness-card-photos','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/1.webp');
SELECT pg_temp.expect_error('INSERT INTO storage.objects(bucket_id,name) VALUES(''fitness-card-photos'',''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/4.webp'')','new row violates row-level security');
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $$ BEGIN IF (SELECT count(*) FROM storage.objects WHERE bucket_id='fitness-card-photos')<>1 THEN RAISE EXCEPTION 'Accepted viewer cannot download'; END IF; END $$;
SELECT pg_temp.expect_error('INSERT INTO storage.objects(bucket_id,name) VALUES(''fitness-card-photos'',''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/2.webp'')','new row violates row-level security');
RESET ROLE;
SELECT set_config('request.jwt.claim.role','service_role',false);
UPDATE public.profiles SET account_status='suspended',suspended_until=now()+interval '1 day' WHERE username='fitness_a';
SELECT set_config('request.jwt.claim.role','authenticated',false);
SET ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT FROM storage.objects WHERE bucket_id='fitness-card-photos') THEN RAISE EXCEPTION 'Suspended owner photos leaked'; END IF; END $$;
SELECT pg_temp.expect_error('SELECT public.get_fitness_card(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'')','FITNESS_CARD_NOT_ALLOWED');
RESET ROLE;
SELECT set_config('request.jwt.claim.role','service_role',false);
UPDATE public.profiles SET account_status='active',suspended_until=NULL WHERE username='fitness_a';
SELECT set_config('request.jwt.claim.role','authenticated',false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$ DECLARE card jsonb; e jsonb; key text; before_revision bigint;
BEGIN
 card:=public.get_fitness_card(auth.uid()); before_revision:=(card->>'revision')::bigint;
 IF jsonb_array_length(card->'photos')<>1 THEN RAISE EXCEPTION 'Photo metadata missing'; END IF;
 e:=jsonb_build_object('records',jsonb_build_array(jsonb_build_object('exerciseId','press','name','Press','kind','strength','weightKg',50,'reps',8,'seconds',NULL,'date',current_date::text)),
 'muscles',jsonb_build_array(jsonb_build_object('id','chest','sessions',2)),'totalSessions',3,'partialSessions',1,'rangeFrom',(current_date-83)::text,'rangeTo',current_date::text,'updatedAt',to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
 FOREACH key IN ARRAY ARRAY['records','muscles','totalSessions','partialSessions','rangeFrom','rangeTo','updatedAt'] LOOP
  PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',jsonb_set(e,ARRAY[key],'null'::jsonb),before_revision),'FITNESS_CARD_INVALID');
 END LOOP;
 PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',e||'{"injuries":"private"}'::jsonb,before_revision),'FITNESS_CARD_INVALID');
 PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',jsonb_set(e,'{muscles,0,id}','"invented"'),before_revision),'FITNESS_CARD_INVALID');
 PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',jsonb_set(e,'{rangeFrom}',to_jsonb((current_date-84)::text)),before_revision),'FITNESS_CARD_INVALID');
 PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',jsonb_set(e,'{records,0,date}','"2026-02-30"'),before_revision),'FITNESS_CARD_INVALID');
 PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',jsonb_set(e,'{records,0,date}',to_jsonb((current_date+2)::text)),before_revision),'FITNESS_CARD_INVALID');
 PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',jsonb_set(e,'{records,0,secret}','"private"'),before_revision),'FITNESS_CARD_INVALID');
 PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',jsonb_set(e,'{muscles,0,secret}','"private"'),before_revision),'FITNESS_CARD_INVALID');
 PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',jsonb_set(e,'{records,0,reps}','101'),before_revision),'FITNESS_CARD_INVALID');
 PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',jsonb_set(e,'{rangeFrom}',to_jsonb((current_date-81)::text))||jsonb_build_object('rangeTo',(current_date+2)::text),before_revision),'FITNESS_CARD_INVALID');
 card:=public.publish_fitness_card_evidence(e,before_revision);
 IF (card->>'revision')::bigint<>before_revision+1 OR card->>'artisticName'<>'Art A' OR card->>'theme'<>'violet' OR jsonb_array_length(card->'photos')<>1 THEN RAISE EXCEPTION 'Publishing changed design/photos'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.publish_fitness_card_evidence(%L,%s)',e,before_revision),'FITNESS_CARD_CONFLICT');
END $$;
DO $$ DECLARE revision_before bigint; BEGIN
 revision_before:=(public.get_fitness_card(auth.uid())->>'revision')::bigint;
 UPDATE storage.objects SET metadata='{"mimetype":"image/webp"}' WHERE bucket_id='fitness-card-photos' AND name=auth.uid()::text||'/1.webp';
 IF (public.get_fitness_card(auth.uid())->>'revision')::bigint<>revision_before+1 THEN RAISE EXCEPTION 'Photo replacement missed revision'; END IF;
 DELETE FROM storage.objects WHERE bucket_id='fitness-card-photos' AND name=auth.uid()::text||'/1.webp';
 IF jsonb_array_length(public.get_fitness_card(auth.uid())->'photos')<>0 THEN RAISE EXCEPTION 'Deleted photo retained'; END IF;
END $$;
RESET ROLE;
INSERT INTO auth.users(id,email) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','fitness-d@example.invalid');
INSERT INTO public.profiles(id,username) VALUES('dddddddd-dddd-4ddd-8ddd-dddddddddddd','FITNESS_B');
SET ROLE authenticated;
SELECT pg_temp.expect_error('SELECT public.fitness_card_access(''share'',''fitness_b'',NULL)','FITNESS_CARD_HANDLE_UNAVAILABLE');
RESET ROLE;
DELETE FROM public.profiles WHERE id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
DO $$ BEGIN
 IF has_function_privilege('anon','public.get_fitness_card(uuid)','EXECUTE') OR has_table_privilege('authenticated','private.fitness_cards','SELECT') OR has_table_privilege('authenticated','private.fitness_card_access','SELECT') THEN RAISE EXCEPTION 'Private contract grants escaped'; END IF;
END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT set_config('fitness.c_request',(SELECT item->>'id' FROM jsonb_array_elements(public.get_fitness_card_state()->'access') item WHERE item#>>'{owner,userId}'='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),false);
SELECT pg_temp.expect_error(format('SELECT public.fitness_card_access(''revoke'',NULL,%L)',current_setting('fitness.c_request')),'FITNESS_CARD_NOT_ALLOWED');
SELECT public.fitness_card_access('leave',NULL,current_setting('fitness.c_request')::uuid);
SELECT pg_temp.expect_error('SELECT public.get_fitness_card(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'')','FITNESS_CARD_NOT_ALLOWED');
SELECT public.fitness_card_access('request','fitness_a',NULL);
SELECT set_config('fitness.c_request',(SELECT item->>'id' FROM jsonb_array_elements(public.get_fitness_card_state()->'access') item WHERE item#>>'{owner,userId}'='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),false);
SELECT public.fitness_card_access('cancel',NULL,current_setting('fitness.c_request')::uuid);
SELECT public.fitness_card_access('request','fitness_a',NULL);
SELECT set_config('fitness.c_request',(SELECT item->>'id' FROM jsonb_array_elements(public.get_fitness_card_state()->'access') item WHERE item#>>'{owner,userId}'='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),false);
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT public.fitness_card_access('reject',NULL,current_setting('fitness.c_request')::uuid);
SELECT pg_temp.expect_error('SELECT public.fitness_card_access(''share'',''fitness_a'',NULL)','FITNESS_CARD_INVALID');
SELECT pg_temp.expect_error('SELECT public.save_fitness_card(NULL,''violet'',1)','FITNESS_CARD_INVALID');
SELECT pg_temp.expect_error('SELECT public.fitness_card_access(''invalid'',NULL,NULL)','FITNESS_CARD_INVALID');
RESET ROLE;
SELECT set_config('request.jwt.claim.role','service_role',false);
UPDATE public.profiles SET account_status='suspended',suspended_until=now()+interval '1 day' WHERE username='fitness_c';
SELECT set_config('request.jwt.claim.role','authenticated',false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);
SELECT pg_temp.expect_error('SELECT public.get_fitness_card_state()','FITNESS_CARD_AUTH_REQUIRED');
SELECT pg_temp.expect_error('SELECT public.save_fitness_card(''x'',''violet'',0)','FITNESS_CARD_AUTH_REQUIRED');
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM storage.buckets WHERE id='fitness-card-photos' AND public=false AND file_size_limit=2097152 AND allowed_mime_types=ARRAY['image/webp']) THEN RAISE EXCEPTION 'Photo bucket constraints missing'; END IF;
END $$;
