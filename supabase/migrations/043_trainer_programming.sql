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

-- A professional prescription is a client-owned materialization, not a new
-- personal library family. These columns deliberately retain the normal
-- workout_plans shape so the existing session engine can execute it.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free';
ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS family_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;
ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS library_slot TEXT NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS trainer_relationship_id UUID,
  ADD COLUMN IF NOT EXISTS trainer_assignment_id UUID,
  ADD COLUMN IF NOT EXISTS trainer_assignment_version_id UUID,
  ADD COLUMN IF NOT EXISTS prescription_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- Explicitly backfill old rows before applying the all-or-nothing identity
-- rule. Historical plans remain personal and mutable.
UPDATE public.workout_plans
SET library_slot = 'personal', prescription_locked = FALSE
WHERE library_slot IS DISTINCT FROM 'personal'
   OR prescription_locked IS DISTINCT FROM FALSE;

ALTER TABLE public.workout_plans
  DROP CONSTRAINT IF EXISTS workout_plans_source_type_check;
ALTER TABLE public.workout_plans
  ADD CONSTRAINT workout_plans_source_type_check
  CHECK (source_type IN ('ai', 'engine', 'manual', 'imported', 'shared_post', 'trainer_assigned'));
ALTER TABLE public.workout_plans
  DROP CONSTRAINT IF EXISTS workout_plans_trainer_relationship_id_fkey,
  DROP CONSTRAINT IF EXISTS workout_plans_trainer_assignment_id_fkey,
  DROP CONSTRAINT IF EXISTS workout_plans_trainer_assignment_version_id_fkey;
ALTER TABLE public.workout_plans
  ADD CONSTRAINT workout_plans_trainer_relationship_id_fkey
    FOREIGN KEY (trainer_relationship_id) REFERENCES public.coaching_relationships(id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT workout_plans_trainer_assignment_id_fkey
    FOREIGN KEY (trainer_assignment_id) REFERENCES public.trainer_plan_assignments(id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT workout_plans_trainer_assignment_version_id_fkey
    FOREIGN KEY (trainer_assignment_version_id) REFERENCES public.trainer_assignment_versions(id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

-- Re-declare the existing invariant as documentation and a migration-time
-- guard: both personal and professional materializations compete for one
-- active slot, even though only personal plans consume the Free allowance.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_plans_one_active_per_user
  ON public.workout_plans(user_id)
  WHERE is_active = TRUE;

CREATE OR REPLACE FUNCTION public.validate_trainer_assigned_plan_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.source_type = 'trainer_assigned' THEN
    IF NEW.library_slot <> 'professional'
      OR NEW.prescription_locked <> TRUE
      OR NEW.trainer_relationship_id IS NULL
      OR NEW.trainer_assignment_id IS NULL
      OR NEW.trainer_assignment_version_id IS NULL THEN
      RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.trainer_plan_assignments assignment
      JOIN public.trainer_assignment_versions version
        ON version.id = NEW.trainer_assignment_version_id
       AND version.assignment_id = assignment.id
       AND version.materialized_plan_id = NEW.id
      JOIN public.coaching_relationships relationship
        ON relationship.id = NEW.trainer_relationship_id
       AND relationship.id = assignment.relationship_id
      WHERE assignment.id = NEW.trainer_assignment_id
        AND assignment.client_user_id = NEW.user_id
        AND relationship.client_user_id = NEW.user_id
        AND relationship.trainer_user_id = assignment.trainer_user_id
    ) THEN
      RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
    END IF;
  ELSIF NEW.library_slot <> 'personal'
    OR NEW.prescription_locked <> FALSE
    OR NEW.trainer_relationship_id IS NOT NULL
    OR NEW.trainer_assignment_id IS NOT NULL
    OR NEW.trainer_assignment_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_trainer_assigned_plan ON public.workout_plans;
CREATE CONSTRAINT TRIGGER trg_validate_trainer_assigned_plan
  AFTER INSERT OR UPDATE OF source_type, library_slot, prescription_locked,
    trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id, user_id
  ON public.workout_plans
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_trainer_assigned_plan_identity();

CREATE OR REPLACE FUNCTION public.validate_materialized_assignment_version_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workout_plans plan
    WHERE plan.trainer_assignment_version_id = NEW.id
      AND (NEW.materialized_plan_id IS DISTINCT FROM plan.id
        OR NEW.assignment_id IS DISTINCT FROM plan.trainer_assignment_id)
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_materialized_assignment_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.workout_plans plan
    JOIN public.trainer_assignment_versions version ON version.id = plan.trainer_assignment_version_id
    JOIN public.coaching_relationships relationship ON relationship.id = NEW.relationship_id
    WHERE plan.trainer_assignment_id = NEW.id
      AND (plan.user_id IS DISTINCT FROM NEW.client_user_id
        OR plan.trainer_relationship_id IS DISTINCT FROM NEW.relationship_id
        OR version.assignment_id IS DISTINCT FROM NEW.id
        OR relationship.client_user_id IS DISTINCT FROM NEW.client_user_id
        OR relationship.trainer_user_id IS DISTINCT FROM NEW.trainer_user_id)
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNED_PLAN_IDENTITY_INVALID';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_materialized_assignment_version_identity ON public.trainer_assignment_versions;
CREATE CONSTRAINT TRIGGER trg_validate_materialized_assignment_version_identity
  AFTER UPDATE OF materialized_plan_id, assignment_id ON public.trainer_assignment_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_materialized_assignment_version_identity();
DROP TRIGGER IF EXISTS trg_validate_materialized_assignment_identity ON public.trainer_plan_assignments;
CREATE CONSTRAINT TRIGGER trg_validate_materialized_assignment_identity
  AFTER UPDATE OF relationship_id, trainer_user_id, client_user_id ON public.trainer_plan_assignments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_materialized_assignment_identity();

CREATE OR REPLACE FUNCTION public.enforce_plan_family_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_subscription_tier TEXT;
  v_family_count INTEGER;
  v_family_exists BOOLEAN;
BEGIN
  IF v_actor_id IS NULL THEN
    IF v_actor_role <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
  ELSIF v_actor_id <> NEW.user_id
    AND v_actor_role <> 'service_role'
    AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PLAN_OWNERSHIP_MISMATCH';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::TEXT, 0));
  IF NEW.is_active AND (NEW.retired_at IS NOT NULL OR NEW.superseded_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PLAN_VERSION_UNAVAILABLE';
  END IF;
  IF NEW.retired_at IS NOT NULL OR NEW.superseded_at IS NOT NULL OR NEW.library_slot <> 'personal' THEN
    RETURN NEW;
  END IF;

  SELECT subscription_tier INTO v_subscription_tier FROM profiles WHERE id = NEW.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF COALESCE(v_subscription_tier, 'free') = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans
    WHERE user_id = NEW.user_id AND library_slot = 'personal'
      AND retired_at IS NULL AND superseded_at IS NULL AND id <> NEW.id;
    SELECT EXISTS (
      SELECT 1 FROM workout_plans
      WHERE user_id = NEW.user_id AND library_slot = 'personal' AND family_id = NEW.family_id
        AND retired_at IS NULL AND superseded_at IS NULL AND id <> NEW.id
    ) INTO v_family_exists;
    IF NOT v_family_exists AND v_family_count >= 2 THEN
      RAISE EXCEPTION 'PLAN_FAMILY_LIMIT: free plan family limit reached';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_family_limit ON public.workout_plans;
CREATE TRIGGER trg_enforce_plan_family_limit
  BEFORE INSERT OR UPDATE OF user_id, family_id, library_slot, retired_at, superseded_at, is_active
  ON public.workout_plans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_family_limit();

CREATE OR REPLACE FUNCTION public.enforce_subscription_tier_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_family_count INTEGER;
BEGIN
  IF NEW.subscription_tier IS NOT DISTINCT FROM OLD.subscription_tier THEN RETURN NEW; END IF;
  IF v_actor_role <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PLAN_SUBSCRIPTION_TIER_CHANGE_FORBIDDEN';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(NEW.id::TEXT, 0)) THEN
    RAISE EXCEPTION 'PLAN_TIER_LOCK_BUSY_RETRY';
  END IF;
  IF OLD.subscription_tier = 'pro' AND NEW.subscription_tier = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans WHERE user_id = NEW.id AND library_slot = 'personal'
      AND retired_at IS NULL AND superseded_at IS NULL;
    IF v_family_count > 2 THEN
      RAISE EXCEPTION 'PLAN_DOWNGRADE_FAMILY_LIMIT: archive plans until at most two current families remain';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_subscription_tier_atomic(
  p_user_id UUID, p_subscription_tier TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_role TEXT := COALESCE(auth.role(), '');
  v_current_tier TEXT;
  v_family_count INTEGER;
BEGIN
  IF v_actor_role <> 'service_role' AND session_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'PLAN_SUBSCRIPTION_TIER_CHANGE_FORBIDDEN';
  END IF;
  IF p_subscription_tier NOT IN ('free', 'pro') THEN RAISE EXCEPTION 'Invalid subscription tier'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));
  PERFORM set_config('app.plan_lifecycle_actor', p_user_id::TEXT, TRUE);
  SELECT subscription_tier INTO v_current_tier FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF v_current_tier = 'pro' AND p_subscription_tier = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans WHERE user_id = p_user_id AND library_slot = 'personal'
      AND retired_at IS NULL AND superseded_at IS NULL;
    IF v_family_count > 2 THEN
      RAISE EXCEPTION 'PLAN_DOWNGRADE_FAMILY_LIMIT: archive plans until at most two current families remain';
    END IF;
  END IF;
  UPDATE profiles SET subscription_tier = p_subscription_tier WHERE id = p_user_id;
  RETURN p_user_id;
END;
$$;

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
  IF NEW.source_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trainer_program_templates template
    WHERE template.id = NEW.source_template_id
      AND template.trainer_user_id = NEW.trainer_user_id
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_OWNER_MISMATCH';
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

CREATE OR REPLACE FUNCTION public.require_public_trainer_template_exercise()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.exercises exercise WHERE exercise.id = NEW.exercise_id AND exercise.is_public = TRUE) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_EXERCISE_NOT_PUBLIC';
  END IF;
  RETURN NEW;
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
  BEFORE INSERT OR UPDATE OF relationship_id, trainer_user_id, client_user_id, source_template_id ON public.trainer_plan_assignments
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
DROP TRIGGER IF EXISTS trg_trainer_template_exercises_public_catalog ON public.trainer_template_exercises;
CREATE TRIGGER trg_trainer_template_exercises_public_catalog
  BEFORE INSERT OR UPDATE OF exercise_id ON public.trainer_template_exercises
  FOR EACH ROW EXECUTE FUNCTION public.require_public_trainer_template_exercise();
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

-- Reordering uses a single locked transaction. The constraints are deferred
-- only inside these RPCs, so a client can never observe a duplicate order.
ALTER TABLE public.trainer_template_workouts
  DROP CONSTRAINT IF EXISTS trainer_template_workouts_template_order_unique;
ALTER TABLE public.trainer_template_workouts
  ADD CONSTRAINT trainer_template_workouts_template_order_unique
  UNIQUE (template_id, order_in_plan) DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE public.trainer_template_exercises
  DROP CONSTRAINT IF EXISTS trainer_template_exercises_workout_order_unique;
ALTER TABLE public.trainer_template_exercises
  ADD CONSTRAINT trainer_template_exercises_workout_order_unique
  UNIQUE (template_workout_id, order_index) DEFERRABLE INITIALLY IMMEDIATE;

CREATE OR REPLACE FUNCTION public.reorder_trainer_template_workouts(
  p_template_id UUID,
  p_workout_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids UUID[];
  v_expected UUID[];
  v_trainer_user_id UUID;
BEGIN
  SELECT trainer_user_id INTO v_trainer_user_id FROM public.trainer_program_templates WHERE id = p_template_id;
  IF auth.uid() IS NULL OR v_trainer_user_id IS NULL OR v_trainer_user_id <> auth.uid() THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));
  PERFORM 1 FROM public.profiles profile WHERE profile.id = v_trainer_user_id AND profile.account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM 1 FROM public.trainer_profiles profile WHERE profile.user_id = v_trainer_user_id AND profile.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  IF p_workout_ids IS NULL OR cardinality(p_workout_ids) IS NULL OR cardinality(p_workout_ids) = 0
    OR cardinality(p_workout_ids) <> cardinality(ARRAY(SELECT DISTINCT item FROM unnest(p_workout_ids) AS item)) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_REORDER_INVALID';
  END IF;
  PERFORM 1 FROM public.trainer_program_templates WHERE id = p_template_id FOR UPDATE;
  WITH locked_workouts AS (
    SELECT id FROM public.trainer_template_workouts WHERE template_id = p_template_id FOR UPDATE
  ) SELECT array_agg(id ORDER BY id) INTO v_expected FROM locked_workouts;
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM unnest(p_workout_ids) AS id;
  IF v_expected IS NULL OR v_expected IS DISTINCT FROM v_ids THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_REORDER_INCOMPLETE'; END IF;
  SET CONSTRAINTS trainer_template_workouts_template_order_unique DEFERRED;
  UPDATE public.trainer_template_workouts workout
  SET order_in_plan = array_position(p_workout_ids, workout.id)
  WHERE workout.template_id = p_template_id;
  RETURN jsonb_build_object('template_id', p_template_id, 'changed', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_trainer_template_exercises(
  p_template_workout_id UUID,
  p_template_exercise_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids UUID[];
  v_expected UUID[];
  v_trainer_user_id UUID;
BEGIN
  SELECT template.trainer_user_id INTO v_trainer_user_id FROM public.trainer_template_workouts workout JOIN public.trainer_program_templates template ON template.id = workout.template_id WHERE workout.id = p_template_workout_id;
  IF auth.uid() IS NULL OR v_trainer_user_id IS NULL OR v_trainer_user_id <> auth.uid() THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));
  PERFORM 1 FROM public.profiles profile WHERE profile.id = v_trainer_user_id AND profile.account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  PERFORM 1 FROM public.trainer_profiles profile WHERE profile.user_id = v_trainer_user_id AND profile.status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_OWNER_REQUIRED'; END IF;
  IF p_template_exercise_ids IS NULL OR cardinality(p_template_exercise_ids) IS NULL OR cardinality(p_template_exercise_ids) = 0
    OR cardinality(p_template_exercise_ids) <> cardinality(ARRAY(SELECT DISTINCT item FROM unnest(p_template_exercise_ids) AS item)) THEN
    RAISE EXCEPTION 'TRAINER_TEMPLATE_REORDER_INVALID';
  END IF;
  PERFORM 1 FROM public.trainer_template_workouts WHERE id = p_template_workout_id FOR UPDATE;
  WITH locked_exercises AS (
    SELECT id FROM public.trainer_template_exercises WHERE template_workout_id = p_template_workout_id FOR UPDATE
  ) SELECT array_agg(id ORDER BY id) INTO v_expected FROM locked_exercises;
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM unnest(p_template_exercise_ids) AS id;
  IF v_expected IS NULL OR v_expected IS DISTINCT FROM v_ids THEN RAISE EXCEPTION 'TRAINER_TEMPLATE_REORDER_INCOMPLETE'; END IF;
  SET CONSTRAINTS trainer_template_exercises_workout_order_unique DEFERRED;
  UPDATE public.trainer_template_exercises exercise
  SET order_index = array_position(p_template_exercise_ids, exercise.id)
  WHERE exercise.template_workout_id = p_template_workout_id;
  RETURN jsonb_build_object('template_workout_id', p_template_workout_id, 'changed', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_trainer_template_workouts(UUID, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_trainer_template_exercises(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_trainer_template_workouts(UUID, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_trainer_template_exercises(UUID, UUID[]) TO authenticated, service_role;

-- A proposal is retriable without creating another immutable copy. The key is
-- deliberately scoped to its authenticated trainer so unrelated trainers can
-- use independent client-generated keys.
ALTER TABLE public.trainer_plan_assignments
  ADD COLUMN IF NOT EXISTS proposal_idempotency_key TEXT;
ALTER TABLE public.trainer_plan_assignments
  DROP CONSTRAINT IF EXISTS trainer_plan_assignments_proposal_idempotency_key_check;
ALTER TABLE public.trainer_plan_assignments
  ADD CONSTRAINT trainer_plan_assignments_proposal_idempotency_key_check
  CHECK (proposal_idempotency_key IS NULL OR char_length(btrim(proposal_idempotency_key)) BETWEEN 1 AND 200);
CREATE UNIQUE INDEX IF NOT EXISTS trainer_plan_assignments_proposal_idempotency_unique
  ON public.trainer_plan_assignments (trainer_user_id, proposal_idempotency_key)
  WHERE proposal_idempotency_key IS NOT NULL;

-- Template prescriptions permit fractional RPE values. Preserve that exact
-- value when materializing a professional plan rather than silently rounding.
ALTER TABLE public.workout_exercises
  ALTER COLUMN target_rpe TYPE NUMERIC(3, 1) USING target_rpe::NUMERIC(3, 1);

-- Keep the professional workflow self-contained for installations that apply
-- the programming migration without the optional notifications bootstrap.
CREATE OR REPLACE FUNCTION public.create_product_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_url TEXT,
  p_dedupe_key TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS public.product_notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  notification public.product_notifications%ROWTYPE;
BEGIN
  IF current_setting('app.test_fail_acceptance_notification', true) = 'on'
    AND p_dedupe_key LIKE 'coaching-assignment-accepted:%' THEN
    RAISE EXCEPTION 'TEST_ACCEPTANCE_NOTIFICATION_FAILURE';
  END IF;
  INSERT INTO public.product_notifications (user_id, type, title, body, url, payload, dedupe_key)
  VALUES (p_user_id, p_type, p_title, p_body, p_url, COALESCE(p_payload, '{}'::JSONB), p_dedupe_key)
  ON CONFLICT (user_id, dedupe_key) DO NOTHING
  RETURNING * INTO notification;
  IF notification.id IS NULL THEN
    SELECT * INTO STRICT notification FROM public.product_notifications
    WHERE user_id = p_user_id AND dedupe_key = p_dedupe_key;
  END IF;
  RETURN notification;
END;
$$;
ALTER FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.propose_trainer_assignment(
  p_relationship_id UUID,
  p_template_id UUID,
  p_change_summary TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (assignment_id UUID, assignment_version_id UUID, workout_plan_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trainer_user_id UUID := auth.uid();
  v_client_user_id UUID;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_template public.trainer_program_templates%ROWTYPE;
  v_assignment_id UUID;
  v_assignment_version_id UUID;
  v_workout_plan_id UUID;
  v_snapshot JSONB;
  v_snapshot_workouts JSONB;
  v_workout JSONB;
  v_exercise JSONB;
  v_materialized_workout_id UUID;
  v_workout_count INTEGER;
  v_exercise_count INTEGER;
BEGIN
  IF v_trainer_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_relationship_id IS NULL OR p_template_id IS NULL
    OR NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PROPOSAL_INVALID';
  END IF;
  IF char_length(BTRIM(p_idempotency_key)) > 200
    OR (p_change_summary IS NOT NULL AND char_length(BTRIM(p_change_summary)) > 1000) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PROPOSAL_INVALID';
  END IF;

  -- Acquire the client lock before any mutable relationship state. This is the
  -- same lock order as acceptance/end flows and serializes proposals per client.
  SELECT relationship.client_user_id INTO v_client_user_id
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id;
  IF v_client_user_id IS NULL THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));
  -- This is the exact administrative suspension lock. Revalidate every
  -- trainer/relationship row only after it has been acquired.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_trainer_user_id::TEXT, 0));

  SELECT * INTO v_relationship
  FROM public.coaching_relationships relationship
  WHERE relationship.id = p_relationship_id
    AND relationship.trainer_user_id = v_trainer_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE';
  END IF;
  IF v_relationship.client_user_id <> v_client_user_id THEN
    RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_FOUND';
  END IF;

  PERFORM 1 FROM public.profiles profile
  WHERE profile.id = v_trainer_user_id AND profile.account_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  PERFORM 1 FROM public.trainer_profiles profile
  WHERE profile.user_id = v_trainer_user_id AND profile.status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  PERFORM 1 FROM public.profiles profile
  WHERE profile.id = v_client_user_id AND profile.account_status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CLIENT_INACTIVE'; END IF;

  -- Return the original complete materialization for a retried request.
  SELECT assignment.id, version.id, version.materialized_plan_id
  INTO v_assignment_id, v_assignment_version_id, v_workout_plan_id
  FROM public.trainer_plan_assignments assignment
  JOIN public.trainer_assignment_versions version
    ON version.assignment_id = assignment.id AND version.version_number = 1
  WHERE assignment.trainer_user_id = v_trainer_user_id
    AND assignment.proposal_idempotency_key = BTRIM(p_idempotency_key)
  FOR UPDATE OF assignment, version;
  IF FOUND THEN
    RETURN QUERY SELECT v_assignment_id, v_assignment_version_id, v_workout_plan_id;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.coaching_consents consent
    WHERE consent.relationship_id = v_relationship.id
      AND consent.scope = 'training_profile'
      AND consent.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CONSENT_REQUIRED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.trainer_plan_assignments assignment
    WHERE assignment.client_user_id = v_client_user_id AND assignment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_ACTIVE_EXISTS';
  END IF;

  SELECT * INTO v_template
  FROM public.trainer_program_templates template
  WHERE template.id = p_template_id
    AND template.trainer_user_id = v_trainer_user_id
    AND template.status <> 'archived'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_NOT_AVAILABLE'; END IF;

  SELECT COUNT(*)::INTEGER INTO v_workout_count
  FROM public.trainer_template_workouts workout
  WHERE workout.template_id = v_template.id;
  IF v_workout_count <> v_template.days_per_week THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE';
  END IF;
  SELECT COUNT(*)::INTEGER INTO v_exercise_count
  FROM public.trainer_template_exercises exercise
  JOIN public.trainer_template_workouts workout ON workout.id = exercise.template_workout_id
  JOIN public.exercises catalog ON catalog.id = exercise.exercise_id AND catalog.is_public = TRUE
  WHERE workout.template_id = v_template.id;
  IF v_exercise_count = 0 OR EXISTS (
    SELECT 1
    FROM public.trainer_template_workouts workout
    WHERE workout.template_id = v_template.id
      AND NOT EXISTS (SELECT 1 FROM public.trainer_template_exercises exercise WHERE exercise.template_workout_id = workout.id)
  ) OR EXISTS (
    SELECT 1
    FROM public.trainer_template_exercises exercise
    JOIN public.trainer_template_workouts workout ON workout.id = exercise.template_workout_id
    LEFT JOIN public.exercises catalog ON catalog.id = exercise.exercise_id AND catalog.is_public = TRUE
    WHERE workout.template_id = v_template.id AND catalog.id IS NULL
  ) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TEMPLATE_INCOMPLETE';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'sourceTemplateWorkoutId', row.id,
      'name', row.name,
      'dayOfWeek', row.day_of_week,
      'orderInPlan', row.order_in_plan,
      'exercises', row.exercises
    ) ORDER BY row.day_of_week, row.order_in_plan, row.id
  ) INTO v_snapshot_workouts
  FROM (
    SELECT workout.id, workout.name, workout.day_of_week, workout.order_in_plan,
      jsonb_agg(jsonb_build_object(
        'sourceTemplateExerciseId', exercise.id,
        'exerciseId', exercise.exercise_id,
        'orderIndex', exercise.order_index,
        'sets', exercise.sets,
        'reps', exercise.reps,
        'weightKg', exercise.weight_kg,
        'targetRpe', exercise.target_rpe,
        'restSeconds', exercise.rest_seconds,
        'notes', exercise.notes
      ) ORDER BY exercise.order_index, exercise.id) AS exercises
    FROM public.trainer_template_workouts workout
    JOIN public.trainer_template_exercises exercise ON exercise.template_workout_id = workout.id
    WHERE workout.template_id = v_template.id
    GROUP BY workout.id, workout.name, workout.day_of_week, workout.order_in_plan
  ) AS row;
  v_snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'name', v_template.name,
    'goal', v_template.goal,
    'description', v_template.description,
    'daysPerWeek', v_template.days_per_week,
    'workouts', v_snapshot_workouts
  );

  INSERT INTO public.trainer_plan_assignments (
    relationship_id, trainer_user_id, client_user_id, source_template_id, status, proposal_idempotency_key
  ) VALUES (
    v_relationship.id, v_trainer_user_id, v_client_user_id, v_template.id, 'proposed', BTRIM(p_idempotency_key)
  ) RETURNING id INTO v_assignment_id;
  INSERT INTO public.trainer_assignment_versions (
    assignment_id, version_number, snapshot, change_summary, status
  ) VALUES (
    v_assignment_id, 1, v_snapshot, NULLIF(BTRIM(p_change_summary), ''), 'proposed'
  ) RETURNING id INTO v_assignment_version_id;
  INSERT INTO public.workout_plans (
    user_id, name, goal, duration_weeks, days_per_week, is_active,
    generated_by_ai, plan_context, source_type, family_id, library_slot,
    trainer_relationship_id, trainer_assignment_id, trainer_assignment_version_id, prescription_locked
  ) VALUES (
    v_client_user_id, v_template.name, v_template.goal, 1, v_template.days_per_week, FALSE,
    FALSE, 'first_plan', 'trainer_assigned', gen_random_uuid(), 'professional',
    v_relationship.id, v_assignment_id, v_assignment_version_id, TRUE
  ) RETURNING id INTO v_workout_plan_id;

  FOR v_workout IN SELECT value FROM jsonb_array_elements(v_snapshot->'workouts')
  LOOP
    INSERT INTO public.workouts (user_id, plan_id, name, day_of_week, order_in_plan)
    VALUES (
      v_client_user_id, v_workout_plan_id, v_workout->>'name', NULLIF(v_workout->>'dayOfWeek', '')::INTEGER - 1,
      NULLIF(v_workout->>'orderInPlan', '')::INTEGER
    ) RETURNING id INTO v_materialized_workout_id;
    FOR v_exercise IN SELECT value FROM jsonb_array_elements(v_workout->'exercises')
    LOOP
      INSERT INTO public.workout_exercises (
        workout_id, exercise_id, order_index, sets, reps, rest_seconds, weight_kg, target_rpe, notes
      ) VALUES (
        v_materialized_workout_id, (v_exercise->>'exerciseId')::UUID,
        (v_exercise->>'orderIndex')::INTEGER, (v_exercise->>'sets')::INTEGER,
        (v_exercise->>'reps')::INTEGER, (v_exercise->>'restSeconds')::INTEGER,
        NULLIF(v_exercise->>'weightKg', '')::NUMERIC,
        NULLIF(v_exercise->>'targetRpe', '')::NUMERIC, NULLIF(v_exercise->>'notes', '')
      );
    END LOOP;
  END LOOP;
  UPDATE public.trainer_assignment_versions
  SET materialized_plan_id = v_workout_plan_id
  WHERE id = v_assignment_version_id;

  INSERT INTO public.professional_audit_logs (
    actor_user_id, subject_user_id, entity_type, entity_id, action, metadata
  ) VALUES (
    v_trainer_user_id, v_client_user_id, 'trainer_plan_assignment', v_assignment_id,
    'proposed', jsonb_build_object('relationship_id', v_relationship.id, 'version_number', 1)
  );
  PERFORM public.create_product_notification(
    v_client_user_id, 'coaching_assignment_status', 'Nueva rutina profesional',
    'Tu entrenador te enviÃ³ una rutina para revisar.', '/coaching',
    'coaching-assignment-proposed:' || v_assignment_id::TEXT,
    jsonb_build_object('assignment_id', v_assignment_id, 'version_number', 1)
  );

  RETURN QUERY SELECT v_assignment_id, v_assignment_version_id, v_workout_plan_id;
END;
$$;
ALTER FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_trainer_assignment(UUID, UUID, TEXT, TEXT) TO authenticated, service_role;

-- Acceptance has its own durable key: a browser retry returns the already
-- activated prescription instead of creating another active assignment.
ALTER TABLE public.trainer_plan_assignments
  ADD COLUMN IF NOT EXISTS acceptance_idempotency_key TEXT;
ALTER TABLE public.trainer_plan_assignments
  DROP CONSTRAINT IF EXISTS trainer_plan_assignments_acceptance_idempotency_key_check;
ALTER TABLE public.trainer_plan_assignments
  ADD CONSTRAINT trainer_plan_assignments_acceptance_idempotency_key_check
  CHECK (acceptance_idempotency_key IS NULL OR char_length(btrim(acceptance_idempotency_key)) BETWEEN 1 AND 200);
CREATE UNIQUE INDEX IF NOT EXISTS trainer_plan_assignments_acceptance_idempotency_unique
  ON public.trainer_plan_assignments (client_user_id, acceptance_idempotency_key)
  WHERE acceptance_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_professional_plan_replaceable(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT := COALESCE(auth.role(), '');
BEGIN
  IF p_user_id IS NULL OR (v_actor_role <> 'service_role' AND v_actor_id IS DISTINCT FROM p_user_id) THEN
    RAISE EXCEPTION 'PROFESSIONAL_PLAN_REPLACEMENT_FORBIDDEN';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.workout_plans plan
    JOIN public.trainer_plan_assignments assignment ON assignment.id = plan.trainer_assignment_id
    JOIN public.coaching_relationships relationship ON relationship.id = assignment.relationship_id
    WHERE plan.user_id = p_user_id
      AND plan.library_slot = 'professional'
      AND plan.is_active = TRUE
      AND plan.prescription_locked = TRUE
      AND assignment.status = 'active'
      AND relationship.status = 'active'
  ) THEN
    RAISE EXCEPTION 'PROFESSIONAL_PLAN_REPLACEMENT_FORBIDDEN';
  END IF;
END;
$$;
ALTER FUNCTION public.assert_professional_plan_replaceable(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.assert_professional_plan_replaceable(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_professional_plan_replaceable(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_trainer_assignment(
  p_assignment_id UUID,
  p_idempotency_key TEXT
)
RETURNS TABLE (assignment_id UUID, workout_plan_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client_user_id UUID := auth.uid();
  v_assignment public.trainer_plan_assignments%ROWTYPE;
  v_version public.trainer_assignment_versions%ROWTYPE;
  v_relationship public.coaching_relationships%ROWTYPE;
  v_plan public.workout_plans%ROWTYPE;
  v_target_client_id UUID;
  v_target_trainer_id UUID;
  v_target_relationship_id UUID;
  v_existing_assignment_id UUID;
  v_existing_plan_id UUID;
BEGIN
  IF v_client_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_assignment_id IS NULL OR NULLIF(BTRIM(COALESCE(p_idempotency_key, '')), '') IS NULL
    OR char_length(BTRIM(p_idempotency_key)) > 200 THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_ACCEPTANCE_INVALID';
  END IF;

  -- This non-locking discovery is used only to select the advisory namespaces.
  -- All rows are re-read and locked below before any decision or mutation.
  SELECT client_user_id, trainer_user_id, relationship_id
  INTO v_target_client_id, v_target_trainer_id, v_target_relationship_id
  FROM public.trainer_plan_assignments WHERE id = p_assignment_id;
  IF v_target_client_id IS NULL OR v_target_client_id <> v_client_user_id THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_FOUND';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_user_id::TEXT, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_target_trainer_id::TEXT, 0));

  -- Canonical mutable-row order after client -> trainer advisory locks.
  PERFORM 1 FROM public.profiles WHERE id = v_client_user_id AND account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CLIENT_INACTIVE'; END IF;
  PERFORM 1 FROM public.profiles WHERE id = v_target_trainer_id AND account_status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  PERFORM 1 FROM public.trainer_profiles WHERE user_id = v_target_trainer_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_TRAINER_INACTIVE'; END IF;
  SELECT * INTO v_relationship FROM public.coaching_relationships relationship
  WHERE relationship.id = v_target_relationship_id
    AND relationship.client_user_id = v_client_user_id
    AND relationship.trainer_user_id = v_target_trainer_id FOR UPDATE;
  IF NOT FOUND OR v_relationship.status <> 'active' THEN RAISE EXCEPTION 'COACHING_RELATIONSHIP_NOT_ACTIVE'; END IF;
  SELECT * INTO v_assignment FROM public.trainer_plan_assignments assignment
  WHERE assignment.id = p_assignment_id
    AND assignment.client_user_id = v_client_user_id
    AND assignment.trainer_user_id = v_target_trainer_id
    AND assignment.relationship_id = v_target_relationship_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_FOUND'; END IF;

  SELECT assignment.id, version.materialized_plan_id
  INTO v_existing_assignment_id, v_existing_plan_id
  FROM public.trainer_plan_assignments assignment
  JOIN public.trainer_assignment_versions version ON version.assignment_id = assignment.id AND version.version_number = 1
  WHERE assignment.client_user_id = v_client_user_id
    AND assignment.acceptance_idempotency_key = BTRIM(p_idempotency_key)
  FOR UPDATE OF assignment, version;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing_assignment_id, v_existing_plan_id;
    RETURN;
  END IF;

  IF v_assignment.status <> 'proposed' THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_NOT_PROPOSED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.coaching_consents consent WHERE consent.relationship_id = v_relationship.id AND consent.scope = 'training_profile' AND consent.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_CONSENT_REQUIRED';
  END IF;
  SELECT * INTO v_version FROM public.trainer_assignment_versions version
  WHERE version.assignment_id = v_assignment.id AND version.version_number = 1 FOR UPDATE;
  IF NOT FOUND OR v_version.status <> 'proposed' OR v_version.materialized_plan_id IS NULL THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_VERSION_NOT_PROPOSED';
  END IF;
  SELECT * INTO v_plan FROM public.workout_plans plan
  WHERE plan.id = v_version.materialized_plan_id
    AND plan.user_id = v_client_user_id
    AND plan.trainer_assignment_id = v_assignment.id
    AND plan.trainer_assignment_version_id = v_version.id
    AND plan.source_type = 'trainer_assigned'
    AND plan.library_slot = 'professional'
    AND plan.prescription_locked = TRUE
    AND plan.is_active = FALSE
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRAINER_ASSIGNMENT_PLAN_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM public.trainer_plan_assignments assignment WHERE assignment.client_user_id = v_client_user_id AND assignment.status = 'active') THEN
    RAISE EXCEPTION 'TRAINER_ASSIGNMENT_ACTIVE_EXISTS';
  END IF;

  PERFORM set_config('app.plan_lifecycle_actor', v_client_user_id::TEXT, TRUE);
  UPDATE public.workout_plans SET is_active = FALSE
  WHERE user_id = v_client_user_id AND is_active = TRUE;
  UPDATE public.workout_plans SET is_active = TRUE WHERE id = v_plan.id;
  UPDATE public.trainer_plan_assignments
  SET status = 'cancelled', updated_at = NOW()
  WHERE client_user_id = v_client_user_id AND status = 'proposed' AND id <> v_assignment.id;
  UPDATE public.trainer_plan_assignments
  SET status = 'active', accepted_at = NOW(), active_version_id = v_version.id,
      acceptance_idempotency_key = BTRIM(p_idempotency_key), updated_at = NOW()
  WHERE id = v_assignment.id;
  UPDATE public.trainer_assignment_versions SET status = 'active', effective_from = NOW() WHERE id = v_version.id;
  INSERT INTO public.professional_audit_logs (actor_user_id, subject_user_id, entity_type, entity_id, action, metadata)
  VALUES (v_client_user_id, v_client_user_id, 'trainer_plan_assignment', v_assignment.id, 'accepted', jsonb_build_object('relationship_id', v_relationship.id, 'version_number', 1));
  PERFORM public.create_product_notification(v_assignment.trainer_user_id, 'coaching_assignment_status', 'Rutina profesional aceptada', 'Tu cliente aceptó la rutina profesional.', '/coach/programs', 'coaching-assignment-accepted:' || v_assignment.id::TEXT, jsonb_build_object('assignment_id', v_assignment.id));
  RETURN QUERY SELECT v_assignment.id, v_plan.id;
END;
$$;
ALTER FUNCTION public.accept_trainer_assignment(UUID, TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.accept_trainer_assignment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_trainer_assignment(UUID, TEXT) TO authenticated, service_role;


-- Preserve the Phase 3 atomic contracts while excluding professional
-- materializations from personal-library quota checks.
CREATE OR REPLACE FUNCTION public.create_engine_plan_v2(
  p_plan JSONB,
  p_metadata JSONB,
  p_week_number INTEGER,
  p_plan_context TEXT,
  p_expected_parent_plan_id UUID,
  p_generation_request_id UUID,
  p_profile_updates JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_plan_id UUID;
  v_plan_id UUID;
  v_family_id UUID;
  v_parent_plan workout_plans%ROWTYPE;
  v_subscription_tier TEXT;
  v_family_count INTEGER;
  v_generation_count INTEGER;
  v_workout_id UUID;
  v_day JSONB;
  v_exercise JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_generation_request_id IS NULL THEN
    RAISE EXCEPTION 'PLAN_REQUEST_ID_REQUIRED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  PERFORM set_config('app.plan_lifecycle_actor', v_user_id::TEXT, TRUE);
  PERFORM public.assert_professional_plan_replaceable(v_user_id);

  -- A retry must win even after its parent was superseded by the first attempt.
  SELECT id INTO v_existing_plan_id
  FROM workout_plans
  WHERE user_id = v_user_id
    AND generation_request_id = p_generation_request_id
  LIMIT 1;

  IF v_existing_plan_id IS NOT NULL THEN
    RETURN v_existing_plan_id;
  END IF;

  IF p_plan_context NOT IN ('first_plan', 'weekly_regeneration', 'manual_update') THEN
    RAISE EXCEPTION 'Invalid plan context';
  END IF;

  IF jsonb_typeof(p_plan->'days') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_plan->'days') = 0 THEN
    RAISE EXCEPTION 'Plan has no days';
  END IF;

  IF p_plan_context = 'first_plan' THEN
    IF p_expected_parent_plan_id IS NOT NULL THEN
      RAISE EXCEPTION 'PLAN_INITIAL_PARENT_NOT_ALLOWED';
    END IF;

    SELECT subscription_tier INTO v_subscription_tier
    FROM profiles
    WHERE id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profile not found';
    END IF;

    IF COALESCE(v_subscription_tier, 'free') = 'free' THEN
      SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
      FROM workout_plans
      WHERE user_id = v_user_id
        AND library_slot = 'personal'
        AND retired_at IS NULL
        AND superseded_at IS NULL;

      IF v_family_count >= 2 THEN
        RAISE EXCEPTION 'PLAN_FAMILY_LIMIT: free plan family limit reached';
      END IF;
    END IF;

    SELECT COUNT(*)::INTEGER INTO v_generation_count
    FROM plan_generation_events
    WHERE user_id = v_user_id
      AND mode = 'initial'
      AND generator = 'evidence_engine'
      AND success = TRUE
      AND created_at >= NOW() - INTERVAL '24 hours';

    IF v_generation_count >= 3 THEN
      RAISE EXCEPTION 'PLAN_RATE_LIMIT: initial plan limit reached';
    END IF;

    v_family_id := gen_random_uuid();
  ELSE
    IF p_expected_parent_plan_id IS NULL THEN
      RAISE EXCEPTION 'PLAN_STALE_PARENT: expected active parent is required';
    END IF;

    SELECT * INTO v_parent_plan
    FROM workout_plans
    WHERE id = p_expected_parent_plan_id
      AND user_id = v_user_id
      AND is_active = TRUE
      AND retired_at IS NULL
      AND superseded_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAN_STALE_PARENT: active plan changed';
    END IF;

    v_family_id := v_parent_plan.family_id;

    IF p_plan_context = 'weekly_regeneration' THEN
      SELECT COUNT(*)::INTEGER INTO v_generation_count
      FROM plan_generation_events
      WHERE user_id = v_user_id
        AND mode = 'weekly_regeneration'
        AND generator = 'evidence_engine'
        AND success = TRUE
        AND created_at >= NOW() - INTERVAL '7 days';

      IF v_generation_count >= 2 THEN
        RAISE EXCEPTION 'PLAN_RATE_LIMIT: weekly regeneration limit reached';
      END IF;
    END IF;
  END IF;

  INSERT INTO workout_plans (
    user_id,
    name,
    goal,
    duration_weeks,
    days_per_week,
    difficulty,
    is_active,
    generated_by_ai,
    ai_notes,
    week_number,
    plan_context,
    parent_plan_id,
    source_type,
    generation_metadata,
    family_id,
    generation_request_id,
    library_slot
  ) VALUES (
    v_user_id,
    p_plan->>'display_name',
    p_plan->>'goal',
    1,
    jsonb_array_length(p_plan->'days'),
    NULLIF(p_plan->>'difficulty', ''),
    FALSE,
    FALSE,
    p_plan->>'ai_notes',
    GREATEST(1, p_week_number),
    p_plan_context,
    p_expected_parent_plan_id,
    'engine',
    COALESCE(p_metadata, '{}'::jsonb),
    v_family_id,
    p_generation_request_id,
    'personal'
  )
  RETURNING id INTO v_plan_id;

  FOR v_day IN SELECT value FROM jsonb_array_elements(p_plan->'days')
  LOOP
    IF jsonb_typeof(v_day->'exercises') IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_day->'exercises') = 0 THEN
      RAISE EXCEPTION 'Workout day has no exercises';
    END IF;

    INSERT INTO workouts (
      user_id,
      plan_id,
      name,
      focus,
      day_of_week,
      order_in_plan,
      estimated_duration_minutes
    ) VALUES (
      v_user_id,
      v_plan_id,
      v_day->>'display_name',
      NULLIF(v_day->>'focus', ''),
      (v_day->>'day_of_week')::INTEGER,
      (v_day->>'day_number')::INTEGER,
      (v_day->>'estimated_duration_minutes')::INTEGER
    )
    RETURNING id INTO v_workout_id;

    FOR v_exercise IN SELECT value FROM jsonb_array_elements(v_day->'exercises')
    LOOP
      INSERT INTO workout_exercises (
        workout_id,
        exercise_id,
        order_index,
        sets,
        reps,
        duration_seconds,
        rest_seconds,
        target_rpe,
        weight_kg,
        notes,
        weight_suggestion_basis
      ) VALUES (
        v_workout_id,
        (v_exercise->>'exercise_id')::UUID,
        COALESCE((v_exercise->>'order_index')::INTEGER, 1),
        (v_exercise->>'sets')::INTEGER,
        NULLIF(v_exercise->>'reps', '')::INTEGER,
        NULLIF(v_exercise->>'duration_seconds', '')::INTEGER,
        (v_exercise->>'rest_seconds')::INTEGER,
        NULLIF(v_exercise->>'target_rpe', '')::INTEGER,
        NULLIF(v_exercise->>'weight_kg', '')::NUMERIC,
        NULLIF(v_exercise->>'notes', ''),
        v_exercise->>'weight_suggestion_basis'
      );
    END LOOP;
  END LOOP;

  UPDATE profiles SET
    days_per_week = CASE WHEN p_profile_updates ? 'days_per_week'
      THEN (p_profile_updates->>'days_per_week')::INTEGER ELSE days_per_week END,
    session_duration_minutes = CASE WHEN p_profile_updates ? 'session_duration_minutes'
      THEN (p_profile_updates->>'session_duration_minutes')::INTEGER ELSE session_duration_minutes END,
    preferred_workout_days = CASE WHEN p_profile_updates ? 'preferred_workout_days'
      THEN ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(p_profile_updates->'preferred_workout_days', '[]'::jsonb)
        )::INTEGER
      ) ELSE preferred_workout_days END,
    available_equipment = CASE WHEN p_profile_updates ? 'available_equipment'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile_updates->'available_equipment'))
      ELSE available_equipment END,
    cardio_preferences = CASE WHEN p_profile_updates ? 'cardio_preferences'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile_updates->'cardio_preferences'))
      ELSE cardio_preferences END
  WHERE id = v_user_id;

  IF p_plan_context <> 'first_plan' THEN
    UPDATE workout_plans
    SET is_active = FALSE, superseded_at = NOW()
    WHERE id = p_expected_parent_plan_id
      AND user_id = v_user_id
      AND is_active = TRUE
      AND retired_at IS NULL
      AND superseded_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLAN_STALE_PARENT: active plan changed';
    END IF;
  ELSE
    UPDATE workout_plans
    SET is_active = FALSE
    WHERE user_id = v_user_id
      AND is_active = TRUE;
  END IF;

  UPDATE workout_plans
  SET is_active = TRUE
  WHERE id = v_plan_id
    AND user_id = v_user_id;

  PERFORM public.record_plan_generation_success(v_plan_id);

  RETURN v_plan_id;
END;
$$;

-- The legacy activation surface is intentionally limited to personal plans;
-- professional materializations can become active only via acceptance/revision RPCs.
CREATE OR REPLACE FUNCTION public.activate_plan_version(p_plan_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan public.workout_plans%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  PERFORM set_config('app.plan_lifecycle_actor', v_user_id::TEXT, TRUE);
  SELECT * INTO v_plan FROM public.workout_plans
  WHERE id = p_plan_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF v_plan.library_slot = 'professional' OR v_plan.prescription_locked THEN
    RAISE EXCEPTION 'PROFESSIONAL_PLAN_MANUAL_ACTIVATION_FORBIDDEN';
  END IF;
  PERFORM public.assert_professional_plan_replaceable(v_user_id);
  IF v_plan.retired_at IS NOT NULL THEN RAISE EXCEPTION 'PLAN_VERSION_RETIRED'; END IF;
  IF v_plan.superseded_at IS NOT NULL THEN RAISE EXCEPTION 'PLAN_VERSION_SUPERSEDED'; END IF;
  UPDATE public.workout_plans SET is_active = FALSE WHERE user_id = v_user_id AND is_active = TRUE;
  UPDATE public.workout_plans SET is_active = TRUE
  WHERE id = v_plan.id AND user_id = v_user_id AND retired_at IS NULL AND superseded_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_VERSION_UNAVAILABLE'; END IF;
  RETURN v_plan.id;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_plan_version(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_plan_version(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_manual_plan_atomic(
  p_plan JSONB,
  p_workouts JSONB,
  p_make_active BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_plan_id UUID;
  v_family_id UUID := gen_random_uuid();
  v_subscription_tier TEXT;
  v_family_count INTEGER;
  v_workout JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NULLIF(BTRIM(p_plan->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Manual plan name is required';
  END IF;

  IF jsonb_typeof(p_workouts) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_workouts) = 0 THEN
    RAISE EXCEPTION 'Manual plan has no workouts';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  PERFORM set_config('app.plan_lifecycle_actor', v_user_id::TEXT, TRUE);
  IF p_make_active THEN
    PERFORM public.assert_professional_plan_replaceable(v_user_id);
  END IF;

  SELECT subscription_tier INTO v_subscription_tier
  FROM profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF COALESCE(v_subscription_tier, 'free') = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans
    WHERE user_id = v_user_id
      AND library_slot = 'personal'
      AND retired_at IS NULL
      AND superseded_at IS NULL;

    IF v_family_count >= 2 THEN
      RAISE EXCEPTION 'PLAN_FAMILY_LIMIT: free plan family limit reached';
    END IF;
  END IF;

  INSERT INTO workout_plans (
    user_id,
    name,
    goal,
    duration_weeks,
    days_per_week,
    difficulty,
    is_active,
    generated_by_ai,
    plan_context,
    source_type,
    manually_updated_at,
    family_id,
    library_slot
  ) VALUES (
    v_user_id,
    BTRIM(p_plan->>'name'),
    NULLIF(BTRIM(p_plan->>'goal'), ''),
    COALESCE((p_plan->>'duration_weeks')::INTEGER, 1),
    jsonb_array_length(p_workouts),
    NULLIF(p_plan->>'difficulty', ''),
    FALSE,
    FALSE,
    'manual_update',
    'manual',
    NOW(),
    v_family_id,
    'personal'
  )
  RETURNING id INTO v_plan_id;

  FOR v_workout IN
    SELECT value FROM jsonb_array_elements(COALESCE(p_workouts, '[]'::jsonb))
  LOOP
    IF NULLIF(BTRIM(v_workout->>'name'), '') IS NULL THEN
      RAISE EXCEPTION 'Manual workout name is required';
    END IF;

    INSERT INTO workouts (
      user_id,
      plan_id,
      name,
      focus,
      day_of_week,
      order_in_plan,
      estimated_duration_minutes
    ) VALUES (
      v_user_id,
      v_plan_id,
      BTRIM(v_workout->>'name'),
      NULLIF(BTRIM(v_workout->>'focus'), ''),
      (v_workout->>'day_of_week')::INTEGER,
      (v_workout->>'order_in_plan')::INTEGER,
      COALESCE((v_workout->>'estimated_duration_minutes')::INTEGER, 60)
    );
  END LOOP;

  IF p_make_active THEN
    UPDATE workout_plans
    SET is_active = FALSE
    WHERE user_id = v_user_id
      AND is_active = TRUE;

    UPDATE workout_plans
    SET is_active = TRUE
    WHERE id = v_plan_id
      AND user_id = v_user_id
      AND retired_at IS NULL
      AND superseded_at IS NULL;
  END IF;

  RETURN v_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clone_plan_from_post_atomic(p_post_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_source_user_id UUID;
  v_snapshot JSONB;
  v_plan_id UUID;
  v_family_id UUID := gen_random_uuid();
  v_subscription_tier TEXT;
  v_family_count INTEGER;
  v_workout JSONB;
  v_workout_id UUID;
  v_exercise JSONB;
  v_order_in_plan INTEGER := -1;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::TEXT, 0));
  PERFORM set_config('app.plan_lifecycle_actor', v_user_id::TEXT, TRUE);
  PERFORM public.assert_professional_plan_replaceable(v_user_id);

  -- SECURITY INVOKER keeps the current posts SELECT policy authoritative:
  -- removed, blocked or private posts unavailable to this user are not visible.
  SELECT user_id, routine_snapshot
  INTO v_source_user_id, v_snapshot
  FROM posts
  WHERE id = p_post_id
    AND routine_snapshot IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'POST_ROUTINE_NOT_FOUND_OR_UNAVAILABLE';
  END IF;

  IF NULLIF(BTRIM(v_snapshot->>'name'), '') IS NULL
    OR jsonb_typeof(v_snapshot->'workouts') IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_snapshot->'workouts') = 0 THEN
    RAISE EXCEPTION 'POST_ROUTINE_INVALID';
  END IF;

  SELECT subscription_tier INTO v_subscription_tier
  FROM profiles
  WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF COALESCE(v_subscription_tier, 'free') = 'free' THEN
    SELECT COUNT(DISTINCT family_id)::INTEGER INTO v_family_count
    FROM workout_plans
    WHERE user_id = v_user_id
      AND library_slot = 'personal'
      AND retired_at IS NULL
      AND superseded_at IS NULL;

    IF v_family_count >= 2 THEN
      RAISE EXCEPTION 'PLAN_FAMILY_LIMIT: free plan family limit reached';
    END IF;
  END IF;

  INSERT INTO workout_plans (
    user_id,
    name,
    goal,
    duration_weeks,
    days_per_week,
    difficulty,
    is_active,
    generated_by_ai,
    plan_context,
    source_type,
    source_post_id,
    source_user_id,
    family_id,
    library_slot
  ) VALUES (
    v_user_id,
    BTRIM(v_snapshot->>'name'),
    NULLIF(BTRIM(v_snapshot->>'goal'), ''),
    1,
    COALESCE(NULLIF(v_snapshot->>'days_per_week', '')::INTEGER, jsonb_array_length(v_snapshot->'workouts')),
    NULLIF(v_snapshot->>'difficulty', ''),
    FALSE,
    FALSE,
    'first_plan',
    'shared_post',
    p_post_id,
    v_source_user_id,
    v_family_id,
    'personal'
  )
  RETURNING id INTO v_plan_id;

  FOR v_workout IN
    SELECT value FROM jsonb_array_elements(v_snapshot->'workouts')
  LOOP
    v_order_in_plan := v_order_in_plan + 1;

    IF NULLIF(BTRIM(v_workout->>'name'), '') IS NULL
      OR jsonb_typeof(v_workout->'exercises') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'POST_ROUTINE_INVALID';
    END IF;

    INSERT INTO workouts (
      user_id,
      plan_id,
      name,
      day_of_week,
      order_in_plan
    ) VALUES (
      v_user_id,
      v_plan_id,
      BTRIM(v_workout->>'name'),
      NULLIF(v_workout->>'day_of_week', '')::INTEGER,
      v_order_in_plan
    )
    RETURNING id INTO v_workout_id;

    FOR v_exercise IN
      SELECT value FROM jsonb_array_elements(v_workout->'exercises')
    LOOP
      INSERT INTO workout_exercises (
        workout_id,
        exercise_id,
        order_index,
        sets,
        reps,
        rest_seconds,
        weight_kg
      ) VALUES (
        v_workout_id,
        (v_exercise->>'exercise_id')::UUID,
        COALESCE((v_exercise->>'order_index')::INTEGER, 0),
        NULLIF(v_exercise->>'sets', '')::INTEGER,
        NULLIF(v_exercise->>'reps', '')::INTEGER,
        NULLIF(v_exercise->>'rest_seconds', '')::INTEGER,
        NULLIF(v_exercise->>'weight_kg', '')::NUMERIC
      );
    END LOOP;
  END LOOP;

  RETURN v_plan_id;
END;
$$;
