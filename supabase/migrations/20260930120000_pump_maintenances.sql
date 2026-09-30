-- Manutenção de bombas (foto da manutenção + recolhimento de resíduos)

CREATE TABLE public.pump_maintenances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  maintained_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  operator_full_name text NOT NULL,
  signature_storage_path text NOT NULL,
  maintenance_photo_path text NOT NULL,
  maintenance_photo_name text,
  maintenance_photo_latitude double precision NOT NULL,
  maintenance_photo_longitude double precision NOT NULL,
  maintenance_photo_captured_at timestamptz NOT NULL,
  residue_photo_path text NOT NULL,
  residue_photo_name text,
  residue_photo_latitude double precision NOT NULL,
  residue_photo_longitude double precision NOT NULL,
  residue_photo_captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pump_maintenances_notes_check
    CHECK (notes IS NULL OR (length(trim(notes)) > 0 AND length(trim(notes)) <= 500)),
  CONSTRAINT pump_maintenances_operator_name_check
    CHECK (length(trim(operator_full_name)) > 0),
  CONSTRAINT pump_maintenances_signature_path_check
    CHECK (length(trim(signature_storage_path)) > 0),
  CONSTRAINT pump_maintenances_maintenance_coords_check CHECK (
    maintenance_photo_latitude BETWEEN -90 AND 90
    AND maintenance_photo_longitude BETWEEN -180 AND 180
  ),
  CONSTRAINT pump_maintenances_residue_coords_check CHECK (
    residue_photo_latitude BETWEEN -90 AND 90
    AND residue_photo_longitude BETWEEN -180 AND 180
  )
);

CREATE INDEX pump_maintenances_posto_id_idx
  ON public.pump_maintenances (posto_id, maintained_at DESC);

ALTER TABLE public.pump_maintenances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pump_maintenances_select_own"
  ON public.pump_maintenances FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "pump_maintenances_insert_own"
  ON public.pump_maintenances FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pump-maintenances',
  'pump-maintenances',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "pump_maintenances_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pump-maintenances'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pump_maintenances_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pump-maintenances'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "pump_maintenances_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pump-maintenances'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
