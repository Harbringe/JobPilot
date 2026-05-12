-- Supabase Storage buckets for user-private files (PDFs + auto-apply screenshots).
-- These complement the on-disk `storage/` directory used in local dev — the
-- backend will switch to uploading here once we wire `@supabase/storage-js`.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('resumes',  'resumes',  false, 10485760, ARRAY['application/pdf']::text[]),
  ('autoapply','autoapply',false, 5242880,  ARRAY['image/png','image/jpeg']::text[])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
