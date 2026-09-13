DO $$ BEGIN
 IF to_regprocedure('public.save_fitness_card_v2(text,text,bigint,jsonb)') IS NULL THEN RAISE EXCEPTION 'Fitness social QR contract missing'; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE statement; RAISE EXCEPTION 'Expected error %, statement succeeded',expected;
EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE expected || '%' THEN RAISE; END IF; END $$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
DO $$ DECLARE c jsonb; old_revision bigint; links jsonb:='{"instagram":"https://instagram.com/ana.fit","x":"https://x.com/ana","facebook":"https://facebook.com/profile.php?id=12345"}'; BEGIN
 c:=public.get_fitness_card(auth.uid()); old_revision:=(c->>'revision')::bigint;
 c:=public.save_fitness_card_v2('Social','ice',old_revision,links);
 IF c->'socialLinks'<>links OR (c->>'revision')::bigint<>old_revision+1 THEN RAISE EXCEPTION 'Atomic social save failed'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.save_fitness_card_v2(''stale'',''ice'',%s,''{}'')',old_revision),'FITNESS_CARD_CONFLICT');
 c:=public.save_fitness_card('Legacy','violet',(c->>'revision')::bigint);
 IF c->'socialLinks'<>links THEN RAISE EXCEPTION 'Old APK erased socials'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.save_fitness_card_v2(''bad'',''ice'',%s,%L)',(c->>'revision')::bigint,'{"x":"https://x.com/intent"}'),'FITNESS_CARD_INVALID');
 PERFORM pg_temp.expect_error(format('SELECT public.save_fitness_card_v2(''bad'',''ice'',%s,%L)',(c->>'revision')::bigint,'{"facebook":"https://facebook.com/profile.php?id=1&next=evil"}'),'FITNESS_CARD_INVALID');
 PERFORM pg_temp.expect_error(format('SELECT public.save_fitness_card_v2(''bad'',''ice'',%s,%L)',(c->>'revision')::bigint,'{"facebook":"https://facebook.com/photo.php"}'),'FITNESS_CARD_INVALID');
END $$;
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $$ DECLARE preview jsonb; BEGIN
 preview:=public.get_fitness_card_invite('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF preview->>'status'<>'available' OR preview-ARRAY['owner','status']<>'{}'::jsonb THEN RAISE EXCEPTION 'QR preview leaks protected card'; END IF;
END $$;
SELECT public.request_fitness_card_by_id('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SELECT set_config('fitness.qr_request',(public.get_fitness_card_state()#>>'{access,0,id}'),false);
SELECT public.request_fitness_card_by_id('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SELECT pg_temp.expect_error('SELECT public.get_fitness_card(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'')','FITNESS_CARD_NOT_ALLOWED');
DO $$ BEGIN IF public.get_fitness_card_invite('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'status'<>'pending' THEN RAISE EXCEPTION 'QR request not pending'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT public.fitness_card_access('accept',NULL,current_setting('fitness.qr_request')::uuid);
SELECT pg_temp.expect_error('SELECT public.request_fitness_card_by_id(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'')','FITNESS_CARD_INVALID');
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
DO $$ BEGIN IF public.get_fitness_card_invite('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'status'<>'accepted' OR public.get_fitness_card('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')#>>'{socialLinks,x}'<>'https://x.com/ana' THEN RAISE EXCEPTION 'Accepted QR/social contract failed'; END IF; END $$;
SELECT public.request_fitness_card_by_id('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
DO $$ BEGIN IF public.get_fitness_card_state()#>>'{access,0,id}'<>current_setting('fitness.qr_request') THEN RAISE EXCEPTION 'Accepted QR retry changed grant'; END IF; END $$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',false);
SELECT public.fitness_card_access('revoke',NULL,current_setting('fitness.qr_request')::uuid);
SELECT set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',false);
SELECT public.request_fitness_card_by_id('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
SELECT pg_temp.expect_error('SELECT public.get_fitness_card(''aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'')','FITNESS_CARD_NOT_ALLOWED');
DO $$ BEGIN IF public.get_fitness_card_state()#>>'{access,0,id}'=current_setting('fitness.qr_request') THEN RAISE EXCEPTION 'Revoked QR request reused stale id'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 IF has_function_privilege('anon','public.get_fitness_card_invite(uuid)','EXECUTE') OR has_function_privilege('anon','public.request_fitness_card_by_id(uuid)','EXECUTE') OR has_function_privilege('anon','public.save_fitness_card_v2(text,text,bigint,jsonb)','EXECUTE') OR has_function_privilege('authenticated','private.fitness_social_links_valid(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Social QR grants escaped'; END IF;
END $$;
