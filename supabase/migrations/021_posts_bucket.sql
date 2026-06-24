-- 021_posts_bucket.sql
-- Bucket público para fotos de publicaciones. Lectura pública; las escrituras
-- se hacen solo desde Server Actions con service-role (ruta {userId}/{postId}/{n}.webp).

INSERT INTO storage.buckets (id, name, public)
VALUES ('posts', 'posts', true)
ON CONFLICT (id) DO NOTHING;
