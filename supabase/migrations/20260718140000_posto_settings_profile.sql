-- Perfil do posto: endereço estruturado, foto e coordenadas GPS

ALTER TABLE public.postos
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS uf text,
  ADD COLUMN IF NOT EXISTS foto_storage_path text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE public.postos
  DROP CONSTRAINT IF EXISTS postos_cep_format_check;

ALTER TABLE public.postos
  ADD CONSTRAINT postos_cep_format_check
  CHECK (cep IS NULL OR cep ~ '^\d{8}$');

ALTER TABLE public.postos
  DROP CONSTRAINT IF EXISTS postos_uf_format_check;

ALTER TABLE public.postos
  ADD CONSTRAINT postos_uf_format_check
  CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$');

ALTER TABLE public.postos
  DROP CONSTRAINT IF EXISTS postos_coords_check;

ALTER TABLE public.postos
  ADD CONSTRAINT postos_coords_check
  CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (
      latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND latitude BETWEEN -90 AND 90
      AND longitude BETWEEN -180 AND 180
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'posto-assets',
  'posto-assets',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "posto_assets_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'posto-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "posto_assets_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'posto-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "posto_assets_storage_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'posto-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'posto-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "posto_assets_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'posto-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
