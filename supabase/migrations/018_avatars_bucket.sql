-- 018_avatars_bucket.sql
-- Bucket público para fotos de avatar de usuario.
-- Lectura pública (como exercise-images). Las escrituras se hacen solo desde la
-- Server Action updateAvatar con service-role, que controla la ruta {userId}/avatar.webp.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
