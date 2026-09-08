-- phase: fixtures
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('59000000-0000-4000-8000-000000000001', 'single-pending-trainer@example.test', '{}'::JSONB),
  ('59000000-0000-4000-8000-000000000002', 'single-pending-client@example.test', '{}'::JSONB);
INSERT INTO public.profiles (id, full_name, avatar_url, onboarding_done, account_status) VALUES
  ('59000000-0000-4000-8000-000000000001', 'Single pending trainer', 'https://example.test/single-pending-trainer.webp', TRUE, 'active'),
  ('59000000-0000-4000-8000-000000000002', 'Single pending client', 'https://example.test/single-pending-client.webp', TRUE, 'active');
INSERT INTO public.trainer_applications (id, user_id, status, decided_at) VALUES
  ('59000000-0000-4000-8000-000000000011', '59000000-0000-4000-8000-000000000001', 'approved', NOW());
INSERT INTO public.trainer_profiles (
  id, user_id, source_application_id, slug, status, professional_name, bio, experience_summary
) VALUES (
  '59000000-0000-4000-8000-000000000021',
  '59000000-0000-4000-8000-000000000001',
  '59000000-0000-4000-8000-000000000011',
  'single-pending-trainer',
  'active',
  'Single pending trainer',
  'Single pending proposal coverage',
  'Migration 059 evidence'
);
INSERT INTO public.trainer_service_offerings (
  id, trainer_profile_id, name, modality, duration_minutes
) VALUES (
  '59000000-0000-4000-8000-000000000031',
  '59000000-0000-4000-8000-000000000021',
  'Single pending service',
  'online',
  60
);
INSERT INTO public.coaching_relationships (
  id, service_id, trainer_user_id, client_user_id, status
) VALUES (
  '59000000-0000-4000-8000-000000000041',
  '59000000-0000-4000-8000-000000000031',
  '59000000-0000-4000-8000-000000000001',
  '59000000-0000-4000-8000-000000000002',
  'active'
);
INSERT INTO public.coaching_consents (relationship_id, scope, text_version, granted_by) VALUES (
  '59000000-0000-4000-8000-000000000041',
  'training_profile',
  'training-profile-v1',
  '59000000-0000-4000-8000-000000000002'
);
INSERT INTO public.exercises (id,name,source,external_id,is_public) VALUES
('59000000-0000-4000-8000-000000000051','Mapped face pull','free-exercise-db','Face_Pull',true),
('59000000-0000-4000-8000-000000000052','Mapped curl','free-exercise-db','Barbell_Curl',true),
('59000000-0000-4000-8000-000000000053','Unmapped legacy Around The Worlds','free-exercise-db','Around_The_Worlds',true);
INSERT INTO public.trainer_program_templates(id,trainer_user_id,name,days_per_week,status)
VALUES('59000000-0000-4000-8000-000000000061','59000000-0000-4000-8000-000000000001','Three days three exercises',3,'draft');
INSERT INTO public.trainer_template_workouts(id,template_id,name,day_of_week,order_in_plan)
SELECT ('59000000-0000-4000-8000-00000000007'||day)::uuid,'59000000-0000-4000-8000-000000000061','Day '||day,day,day FROM generate_series(1,3) day;
INSERT INTO public.trainer_template_exercises(template_workout_id,exercise_id,order_index,sets,reps,weight_kg,target_rpe,rest_seconds,notes)
SELECT workout.id,
  CASE WHEN workout.order_in_plan=3 AND position=3 THEN '59000000-0000-4000-8000-000000000053'::uuid
       WHEN position=2 THEN '59000000-0000-4000-8000-000000000052'::uuid
       ELSE '59000000-0000-4000-8000-000000000051'::uuid END,
  position,position+2,position+7,82.5,7.5,75,'Preserve day '||workout.order_in_plan||' position '||position
FROM public.trainer_template_workouts workout CROSS JOIN generate_series(1,3) position
WHERE workout.template_id='59000000-0000-4000-8000-000000000061';

INSERT INTO auth.users (id,email) VALUES
('59000000-0000-4000-8000-000000000003','availability-fresh@example.test'),
('59000000-0000-4000-8000-000000000004','availability-unrelated@example.test');
INSERT INTO public.profiles (id,full_name,account_status,onboarding_done) VALUES
('59000000-0000-4000-8000-000000000003','Fresh recipient','active',true),
('59000000-0000-4000-8000-000000000004','Unrelated actor','active',true);
INSERT INTO public.coaching_relationships (id,service_id,trainer_user_id,client_user_id,status)
SELECT '59000000-0000-4000-8000-000000000042',service_id,trainer_user_id,'59000000-0000-4000-8000-000000000003','active'
FROM public.coaching_relationships WHERE id='59000000-0000-4000-8000-000000000041';
INSERT INTO public.coaching_consents (relationship_id,scope,text_version,granted_by)
VALUES ('59000000-0000-4000-8000-000000000042','training_profile','training-profile-v1','59000000-0000-4000-8000-000000000003');
INSERT INTO public.exercises (id,name,is_public) VALUES ('59000000-0000-4000-8000-000000000054','Unrelated private exercise',false);
