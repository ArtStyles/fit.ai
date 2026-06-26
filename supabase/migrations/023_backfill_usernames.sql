-- 023_backfill_usernames.sql
-- Asigna username a los perfiles que aún no tienen (username IS NULL).
-- Formato: user_<12 hex del id> — válido (empieza por letra, [a-z0-9_], longitud 17 <= 20)
-- y único (derivado del id). El usuario puede cambiarlo luego en Ajustes.

UPDATE profiles
SET username = 'user_' || substr(replace(id::text, '-', ''), 1, 12)
WHERE username IS NULL;
