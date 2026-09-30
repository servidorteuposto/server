-- Recolhimento de resíduos em menu próprio + remove resíduos da manutenção de bombas

ALTER TABLE IF EXISTS public.pump_maintenances
  DROP CONSTRAINT IF EXISTS pump_maintenances_residue_coords_check;

ALTER TABLE IF EXISTS public.pump_maintenances
  DROP COLUMN IF EXISTS residue_photo_path,
  DROP COLUMN IF EXISTS residue_photo_name,
  DROP COLUMN IF EXISTS residue_photo_latitude,
  DROP COLUMN IF EXISTS residue_photo_longitude,
  DROP COLUMN IF EXISTS residue_photo_captured_at;

CREATE TABLE public.residue_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  collected_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  operator_full_name text NOT NULL,
  signature_storage_path text NOT NULL,
  photo_path text NOT NULL,
  photo_name text,
  photo_latitude double precision NOT NULL,
  photo_longitude double precision NOT NULL,
  photo_captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT residue_collections_notes_check
    CHECK (notes IS NULL OR (length(trim(notes)) > 0 AND length(trim(notes)) <= 500)),
  CONSTRAINT residue_collections_operator_name_check
    CHECK (length(trim(operator_full_name)) > 0),
  CONSTRAINT residue_collections_signature_path_check
    CHECK (length(trim(signature_storage_path)) > 0),
  CONSTRAINT residue_collections_photo_coords_check CHECK (
    photo_latitude BETWEEN -90 AND 90
    AND photo_longitude BETWEEN -180 AND 180
  )
);

CREATE INDEX residue_collections_posto_id_idx
  ON public.residue_collections (posto_id, collected_at DESC);

ALTER TABLE public.residue_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "residue_collections_select_own"
  ON public.residue_collections FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "residue_collections_insert_own"
  ON public.residue_collections FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'residue-collections',
  'residue-collections',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "residue_collections_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'residue-collections'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "residue_collections_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'residue-collections'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "residue_collections_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'residue-collections'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
