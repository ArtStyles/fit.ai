CREATE OR REPLACE FUNCTION public.sync_profile_weight_from_measurements()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id UUID;
  v_should_sync BOOLEAN := FALSE;
  v_latest_weight NUMERIC(5,1);
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_user_id := NEW.user_id;
    v_should_sync := NEW.weight_kg IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'measurement owner cannot be changed'
        USING ERRCODE = 'P0001';
    END IF;
    v_user_id := NEW.user_id;
    v_should_sync := OLD.weight_kg IS DISTINCT FROM NEW.weight_kg
      OR OLD.recorded_at IS DISTINCT FROM NEW.recorded_at
      OR OLD.id IS DISTINCT FROM NEW.id;
  ELSE
    v_user_id := OLD.user_id;
    v_should_sync := OLD.weight_kg IS NOT NULL;
  END IF;

  IF NOT v_should_sync THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  PERFORM 1
    FROM public.profiles AS p
   WHERE p.id = v_user_id
   FOR UPDATE;

  INSERT INTO private.profile_weight_sync_context (transaction_id, backend_pid, profile_id)
  VALUES (pg_catalog.txid_current(), pg_catalog.pg_backend_pid(), v_user_id)
  ON CONFLICT DO NOTHING;

  SELECT m.weight_kg
    INTO v_latest_weight
    FROM public.measurements AS m
   WHERE m.user_id = v_user_id
     AND m.weight_kg IS NOT NULL
   ORDER BY m.recorded_at DESC, m.id DESC
   LIMIT 1;

  UPDATE public.profiles
     SET weight_kg = v_latest_weight
   WHERE id = v_user_id;

  DELETE FROM private.profile_weight_sync_context
   WHERE transaction_id = pg_catalog.txid_current()
     AND backend_pid = pg_catalog.pg_backend_pid()
     AND profile_id = v_user_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_weight_derived()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sync_authorized BOOLEAN := FALSE;
  v_has_weighted_history BOOLEAN := FALSE;
BEGIN
  IF NEW.weight_kg IS NOT DISTINCT FROM OLD.weight_kg
     AND NEW.onboarding_done IS NOT DISTINCT FROM OLD.onboarding_done THEN
    RETURN NEW;
  END IF;

  DELETE FROM private.profile_weight_sync_context
   WHERE transaction_id = pg_catalog.txid_current()
     AND backend_pid = pg_catalog.pg_backend_pid()
     AND profile_id = NEW.id
   RETURNING TRUE INTO v_sync_authorized;

  IF v_sync_authorized THEN
    RETURN NEW;
  END IF;

  IF current_setting('role', true) IN ('service_role', 'supabase_admin')
     OR current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF OLD.onboarding_done AND NOT NEW.onboarding_done THEN
    RAISE EXCEPTION 'onboarding state cannot be reverted'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT OLD.onboarding_done AND NEW.onboarding_done THEN
    SELECT EXISTS (
       SELECT 1
         FROM public.measurements AS m
        WHERE m.user_id = NEW.id
          AND m.weight_kg IS NOT NULL
    ) INTO v_has_weighted_history;

    IF NOT v_has_weighted_history THEN
      RETURN NEW;
    END IF;

    IF NEW.weight_kg IS DISTINCT FROM OLD.weight_kg THEN
      RAISE EXCEPTION 'profile weight is derived from measurements'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  IF OLD.onboarding_done AND NEW.weight_kg IS DISTINCT FROM OLD.weight_kg THEN
    RAISE EXCEPTION 'profile weight is derived from measurements'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS private.profile_weight_sync_context (
  transaction_id BIGINT NOT NULL,
  backend_pid INTEGER NOT NULL,
  profile_id UUID NOT NULL,
  PRIMARY KEY (transaction_id, backend_pid, profile_id)
);
REVOKE ALL ON TABLE private.profile_weight_sync_context FROM PUBLIC;

REVOKE ALL ON FUNCTION public.sync_profile_weight_from_measurements() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_profile_weight_derived() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_profiles_guard_derived_weight ON public.profiles;
DROP TRIGGER IF EXISTS trg_measurements_sync_profile_weight ON public.measurements;
CREATE TRIGGER trg_measurements_sync_profile_weight
AFTER INSERT OR DELETE OR UPDATE OF weight_kg, recorded_at, id, user_id ON public.measurements
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_weight_from_measurements();

WITH latest AS (
  SELECT DISTINCT ON (user_id) user_id, weight_kg
    FROM public.measurements
   WHERE weight_kg IS NOT NULL
   ORDER BY user_id, recorded_at DESC, id DESC
)
UPDATE public.profiles AS p
   SET weight_kg = latest.weight_kg
  FROM latest
 WHERE p.id = latest.user_id
   AND p.weight_kg IS DISTINCT FROM latest.weight_kg;

CREATE TRIGGER trg_profiles_guard_derived_weight
BEFORE UPDATE OF weight_kg, onboarding_done ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_weight_derived();
