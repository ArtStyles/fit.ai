-- Retira el generador legacy después de validar el motor determinista en producción.
-- Los eventos históricos se conservan; las nuevas escrituras solo aceptan evidence_engine.

ALTER TABLE public.plan_generation_events
  DROP CONSTRAINT IF EXISTS plan_generation_events_generator_check;

ALTER TABLE public.plan_generation_events
  ADD CONSTRAINT plan_generation_events_generator_check
  CHECK (generator = 'evidence_engine') NOT VALID;
