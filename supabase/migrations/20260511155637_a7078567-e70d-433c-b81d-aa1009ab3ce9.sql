
ALTER TABLE public.vault_items
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes integer,
  ADD COLUMN IF NOT EXISTS storage_path text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('vault', 'vault', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "vault read own" ON storage.objects;
DROP POLICY IF EXISTS "vault insert own" ON storage.objects;
DROP POLICY IF EXISTS "vault update own" ON storage.objects;
DROP POLICY IF EXISTS "vault delete own" ON storage.objects;

CREATE POLICY "vault read own" ON storage.objects FOR SELECT
  USING (bucket_id = 'vault' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vault insert own" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'vault' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vault update own" ON storage.objects FOR UPDATE
  USING (bucket_id = 'vault' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vault delete own" ON storage.objects FOR DELETE
  USING (bucket_id = 'vault' AND auth.uid()::text = (storage.foldername(name))[1]);
