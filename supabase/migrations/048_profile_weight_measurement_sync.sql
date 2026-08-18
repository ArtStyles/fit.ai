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
    v_user_id := NEW.user_id;
    v_should_sync := OLD.weight_kg IS DISTINCT FROM NEW.weight_kg;
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
BEGIN
  IF NEW.weight_kg IS NOT DISTINCT FROM OLD.weight_kg THEN
    RETURN NEW;
  END IF;

  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NOT OLD.onboarding_done
     AND NEW.onboarding_done
     AND NOT EXISTS (
       SELECT 1
         FROM public.measurements AS m
        WHERE m.user_id = NEW.id
          AND m.weight_kg IS NOT NULL
     ) THEN
    RETURN NEW;
  END IF;

  IF OLD.onboarding_done OR NEW.onboarding_done THEN
    RAISE EXCEPTION 'profile weight is derived from measurements'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_guard_derived_weight ON public.profiles;
DROP TRIGGER IF EXISTS trg_measurements_sync_profile_weight ON public.measurements;
CREATE TRIGGER trg_measurements_sync_profile_weight
AFTER INSERT OR DELETE OR UPDATE OF weight_kg ON public.measurements
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
BEFORE UPDATE OF weight_kg ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_weight_derived();
