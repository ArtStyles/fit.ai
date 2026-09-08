-- Synthetic local fixtures only. No real users or external database.
INSERT INTO auth.users(id,email) SELECT ('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'management-'||n||'@example.test' FROM generate_series(1,6)n;
INSERT INTO profiles(id,full_name,username,account_status,onboarding_done)
SELECT id,CASE WHEN email LIKE 'management-3@%' OR email LIKE 'management-4@%' THEN NULL ELSE 'Management '||email END,CASE WHEN email LIKE 'management-3@%' THEN 'fallback-client' ELSE NULL END,'active',true FROM auth.users WHERE email LIKE 'management-%@example.test';
INSERT INTO trainer_applications(id,user_id,status,decided_at) SELECT ('61000000-0000-4000-8000-'||lpad((n+10)::text,12,'0'))::uuid,('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'approved',now() FROM unnest(ARRAY[1,5])n;
INSERT INTO trainer_profiles(id,user_id,source_application_id,slug,status,professional_name,bio,experience_summary)
SELECT ('61000000-0000-4000-8000-'||lpad((n+20)::text,12,'0'))::uuid,('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('61000000-0000-4000-8000-'||lpad((n+10)::text,12,'0'))::uuid,'management-'||n,'active','Trainer '||n,'Management fixture','Fixture experience' FROM unnest(ARRAY[1,5])n;
INSERT INTO trainer_service_offerings(id,trainer_profile_id,name,modality,duration_minutes) VALUES
('61000000-0000-4000-8000-000000000031','61000000-0000-4000-8000-000000000021','Fuerza guiada','online',60),
('61000000-0000-4000-8000-000000000032','61000000-0000-4000-8000-000000000025','Movilidad','online',60);
INSERT INTO coaching_relationships(id,service_id,trainer_user_id,client_user_id,status,started_at,ended_at,paused_at)
SELECT ('61000000-0000-4000-8000-'||lpad((n+40)::text,12,'0'))::uuid,
('61000000-0000-4000-8000-'||lpad((CASE WHEN n=5 THEN 32 ELSE 31 END)::text,12,'0'))::uuid,
('61000000-0000-4000-8000-'||lpad((CASE WHEN n=5 THEN 5 ELSE 1 END)::text,12,'0'))::uuid,
('61000000-0000-4000-8000-'||lpad((CASE WHEN n=4 THEN 2 ELSE n+1 END)::text,12,'0'))::uuid,
CASE WHEN n=3 THEN 'paused_by_platform' WHEN n=4 THEN 'ended' ELSE 'active' END,
'2026-08-01'::timestamptz-n*interval '1 day',CASE WHEN n=4 THEN '2026-08-01'::timestamptz ELSE NULL END,CASE WHEN n=3 THEN now() ELSE NULL END FROM generate_series(1,5)n;
INSERT INTO coaching_consents(relationship_id,scope,text_version,granted_by,revoked_at,revoked_by)
SELECT id,'training_profile','training-profile-v1',client_user_id,CASE WHEN id='61000000-0000-4000-8000-000000000042' THEN now() ELSE NULL END,CASE WHEN id='61000000-0000-4000-8000-000000000042' THEN client_user_id ELSE NULL END FROM coaching_relationships;
INSERT INTO coaching_requests(service_id,trainer_user_id,client_user_id,status,training_profile_consent_version)
SELECT service_id,trainer_user_id,client_user_id,CASE WHEN status='paused_by_platform' THEN 'pending' ELSE 'accepted' END,'training-profile-v1' FROM coaching_relationships WHERE trainer_user_id='61000000-0000-4000-8000-000000000001';


UPDATE profiles SET avatar_url='' WHERE id='61000000-0000-4000-8000-000000000003';
