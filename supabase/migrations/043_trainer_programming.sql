-- Professional programming is deliberately separate from a client's personal
-- workout_plans. Published assignment versions own an immutable JSON snapshot.

CREATE TABLE IF NOT EXISTS public.trainer_program_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  goal TEXT CHECK (goal IS NULL OR char_length(btrim(goal)) BETWEEN 1 AND 240),
  description TEXT CHECK (description IS NULL OR char_length(btrim(description)) BETWEEN 1 AND 2000),
  days_per_week INTEGER NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.trainer_template_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.trainer_program_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  order_in_plan INTEGER NOT NULL CHECK (order_in_plan BETWEEN 1 AND 7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trainer_template_workouts_template_day_unique UNIQUE (template_id, day_of_week),
  CONSTRAINT trainer_template_workouts_template_order_unique UNIQUE (template_id, order_in_plan)
);

CREATE TABLE IF NOT EXISTS public.trainer_template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_workout_id UUID NOT NULL REFERENCES public.trainer_template_workouts(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE RESTRICT,
  order_index INTEGER NOT NULL CHECK (order_index BETWEEN 1 AND 30),
  sets INTEGER NOT NULL CHECK (sets BETWEEN 1 AND 20),
  reps INTEGER NOT NULL CHECK (reps BETWEEN 1 AND 100),
  weight_kg NUMERIC(8, 2) CHECK (weight_kg IS NULL OR weight_kg BETWEEN 0 AND 1000),
  target_rpe NUMERIC(3, 1) CHECK (target_rpe IS NULL OR target_rpe BETWEEN 1 AND 10),
  rest_seconds INTEGER NOT NULL CHECK (rest_seconds BETWEEN 0 AND 3600),
  notes TEXT CHECK (notes IS NULL OR char_length(btrim(notes)) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trainer_template_exercises_workout_order_unique UNIQUE (template_workout_id, order_index)
);

CREATE TABLE IF NOT EXISTS public.trainer_plan_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID NOT NULL REFERENCES public.coaching_relationships(id) ON DELETE RESTRICT,
  trainer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  client_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source_template_id UUID REFERENCES public.trainer_program_templates(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'active', 'superseded', 'frozen', 'cancelled')),
  accepted_at TIMESTAMPTZ,
  active_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trainer_plan_assignments_client_trainer_distinct CHECK (client_user_id <> trainer_user_id)
);

CREATE TABLE IF NOT EXISTS public.trainer_assignment_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.trainer_plan_assignments(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object' AND snapshot ->> 'schemaVersion' = '1'),
  change_summary TEXT CHECK (change_summary IS NULL OR char_length(btrim(change_summary)) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'active', 'superseded', 'frozen', 'cancelled')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  materialized_plan_id UUID UNIQUE REFERENCES public.workout_plans(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trainer_assignment_versions_effective_range CHECK (effective_to IS NULL OR effective_to > effective_from),
  CONSTRAINT trainer_assignment_versions_assignment_version_unique UNIQUE (assignment_id, version_number)
);

ALTER TABLE public.trainer_plan_assignments
  DROP CONSTRAINT IF EXISTS trainer_plan_assignments_active_version_id_fkey;
ALTER TABLE public.trainer_plan_assignments
  ADD CONSTRAINT trainer_plan_assignments_active_version_id_fkey
  FOREIGN KEY (active_version_id) REFERENCES public.trainer_assignment_versions(id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS trainer_program_templates_owner_status_idx
  ON public.trainer_program_templates (trainer_user_id, status, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS trainer_template_workouts_template_order_idx
  ON public.trainer_template_workouts (template_id, day_of_week, order_in_plan, id);
CREATE INDEX IF NOT EXISTS trainer_template_exercises_workout_order_idx
  ON public.trainer_template_exercises (template_workout_id, order_index, id);
CREATE INDEX IF NOT EXISTS trainer_plan_assignments_relationship_idx
  ON public.trainer_plan_assignments (relationship_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS trainer_assignment_versions_assignment_idx
  ON public.trainer_assignment_versions (assignment_id, version_number DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS trainer_plan_assignments_one_active_client
  ON public.trainer_plan_assignments (client_user_id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.require_trainer_assignment_relationship_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.coaching_relationships relationship
    WHERE relationship.id = NEW.relationship_id
      AND relationship.trainer_user_id = NEW.trainer_user_id
      AND relationship.client_user_id = NEW.client_user_id
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_RELATIONSHIP_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_trainer_assignment_version_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_SNAPSHOT_IMMUTABLE';
  END IF;
  IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_IDENTITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_referenced_trainer_assignment_version_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- active_version_id is an immediate reference today; later session snapshots
  -- add further references without relaxing this immutable-history baseline.
  IF OLD.materialized_plan_id IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.trainer_plan_assignments assignment
    WHERE assignment.active_version_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_REFERENCED';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_trainer_assignment_versions_immutable ON public.trainer_assignment_versions;
CREATE TRIGGER trg_trainer_assignment_versions_immutable
  BEFORE UPDATE ON public.trainer_assignment_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_trainer_assignment_version_immutability();
DROP TRIGGER IF EXISTS trg_trainer_assignment_versions_referenced_delete ON public.trainer_assignment_versions;
CREATE TRIGGER trg_trainer_assignment_versions_referenced_delete
  BEFORE DELETE ON public.trainer_assignment_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_referenced_trainer_assignment_version_delete();
DROP TRIGGER IF EXISTS trg_trainer_plan_assignments_relationship_match ON public.trainer_plan_assignments;
CREATE TRIGGER trg_trainer_plan_assignments_relationship_match
  BEFORE INSERT OR UPDATE OF relationship_id, trainer_user_id, client_user_id ON public.trainer_plan_assignments
  FOR EACH ROW EXECUTE FUNCTION public.require_trainer_assignment_relationship_match();

DROP TRIGGER IF EXISTS trg_trainer_program_templates_updated_at ON public.trainer_program_templates;
CREATE TRIGGER trg_trainer_program_templates_updated_at
  BEFORE UPDATE ON public.trainer_program_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS trg_trainer_template_workouts_updated_at ON public.trainer_template_workouts;
CREATE TRIGGER trg_trainer_template_workouts_updated_at
  BEFORE UPDATE ON public.trainer_template_workouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS trg_trainer_template_exercises_updated_at ON public.trainer_template_exercises;
CREATE TRIGGER trg_trainer_template_exercises_updated_at
  BEFORE UPDATE ON public.trainer_template_exercises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS trg_trainer_plan_assignments_updated_at ON public.trainer_plan_assignments;
CREATE TRIGGER trg_trainer_plan_assignments_updated_at
  BEFORE UPDATE ON public.trainer_plan_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.trainer_program_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_template_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_template_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_assignment_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trainer_program_templates: manage active owner" ON public.trainer_program_templates;
CREATE POLICY "trainer_program_templates: manage active owner"
  ON public.trainer_program_templates FOR ALL TO authenticated
  USING (
    trainer_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trainer_profiles trainer_profile
      WHERE trainer_profile.user_id = auth.uid()
        AND trainer_profile.status = 'active'
        AND public.is_account_active(auth.uid())
    )
  )
  WITH CHECK (
    trainer_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.trainer_profiles trainer_profile
      WHERE trainer_profile.user_id = auth.uid()
        AND trainer_profile.status = 'active'
        AND public.is_account_active(auth.uid())
    )
  );

DROP POLICY IF EXISTS "trainer_template_workouts: manage template owner" ON public.trainer_template_workouts;
CREATE POLICY "trainer_template_workouts: manage template owner"
  ON public.trainer_template_workouts FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trainer_program_templates template
    JOIN public.trainer_profiles trainer_profile ON trainer_profile.user_id = template.trainer_user_id
    WHERE template.id = template_id AND template.trainer_user_id = auth.uid()
      AND trainer_profile.status = 'active' AND public.is_account_active(auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trainer_program_templates template
    JOIN public.trainer_profiles trainer_profile ON trainer_profile.user_id = template.trainer_user_id
    WHERE template.id = template_id AND template.trainer_user_id = auth.uid()
      AND trainer_profile.status = 'active' AND public.is_account_active(auth.uid())
  ));

DROP POLICY IF EXISTS "trainer_template_exercises: manage template owner" ON public.trainer_template_exercises;
CREATE POLICY "trainer_template_exercises: manage template owner"
  ON public.trainer_template_exercises FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trainer_template_workouts template_workout
    JOIN public.trainer_program_templates template ON template.id = template_workout.template_id
    JOIN public.trainer_profiles trainer_profile ON trainer_profile.user_id = template.trainer_user_id
    WHERE template_workout.id = template_workout_id AND template.trainer_user_id = auth.uid()
      AND trainer_profile.status = 'active' AND public.is_account_active(auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trainer_template_workouts template_workout
    JOIN public.trainer_program_templates template ON template.id = template_workout.template_id
    JOIN public.trainer_profiles trainer_profile ON trainer_profile.user_id = template.trainer_user_id
    WHERE template_workout.id = template_workout_id AND template.trainer_user_id = auth.uid()
      AND trainer_profile.status = 'active' AND public.is_account_active(auth.uid())
  ));

DROP POLICY IF EXISTS "trainer_plan_assignments: read active participants" ON public.trainer_plan_assignments;
CREATE POLICY "trainer_plan_assignments: read active participants"
  ON public.trainer_plan_assignments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coaching_relationships relationship
    WHERE relationship.id = trainer_plan_assignments.relationship_id
      AND (auth.uid() = trainer_plan_assignments.client_user_id OR auth.uid() = relationship.trainer_user_id)
      AND public.is_account_active(trainer_plan_assignments.client_user_id)
      AND public.is_account_active(relationship.trainer_user_id)
  ));

DROP POLICY IF EXISTS "trainer_assignment_versions: read active participants" ON public.trainer_assignment_versions;
CREATE POLICY "trainer_assignment_versions: read active participants"
  ON public.trainer_assignment_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trainer_plan_assignments assignment
    JOIN public.coaching_relationships relationship ON relationship.id = assignment.relationship_id
    WHERE assignment.id = trainer_assignment_versions.assignment_id
      AND (auth.uid() = assignment.client_user_id OR auth.uid() = relationship.trainer_user_id)
      AND public.is_account_active(assignment.client_user_id)
      AND public.is_account_active(relationship.trainer_user_id)
  ));

REVOKE ALL ON TABLE public.trainer_program_templates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_template_workouts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_template_exercises FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_plan_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.trainer_assignment_versions FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trainer_program_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trainer_template_workouts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trainer_template_exercises TO authenticated;
GRANT SELECT ON TABLE public.trainer_plan_assignments TO authenticated;
GRANT SELECT ON TABLE public.trainer_assignment_versions TO authenticated;

GRANT ALL ON TABLE public.trainer_program_templates TO service_role;
GRANT ALL ON TABLE public.trainer_template_workouts TO service_role;
GRANT ALL ON TABLE public.trainer_template_exercises TO service_role;
GRANT ALL ON TABLE public.trainer_plan_assignments TO service_role;
GRANT ALL ON TABLE public.trainer_assignment_versions TO service_role;
