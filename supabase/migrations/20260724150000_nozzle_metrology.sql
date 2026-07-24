-- Verificação metrológica de bicos (planilha + foto/assinatura)

CREATE TABLE public.nozzle_metrology_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  employee_full_name text NOT NULL,
  nozzle_count integer NOT NULL,
  overall_status text NOT NULL,
  signature_storage_path text NOT NULL,
  photo_storage_path text NOT NULL,
  photo_file_name text,
  photo_latitude double precision NOT NULL,
  photo_longitude double precision NOT NULL,
  photo_captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nozzle_metrology_verifications_count_check
    CHECK (nozzle_count >= 1 AND nozzle_count <= 200),
  CONSTRAINT nozzle_metrology_verifications_employee_name_check
    CHECK (length(trim(employee_full_name)) > 0),
  CONSTRAINT nozzle_metrology_verifications_status_check
    CHECK (overall_status IN ('aprovado', 'reprovado')),
  CONSTRAINT nozzle_metrology_verifications_photo_coords_check
    CHECK (
      photo_latitude BETWEEN -90 AND 90
      AND photo_longitude BETWEEN -180 AND 180
    )
);

CREATE INDEX nozzle_metrology_verifications_posto_idx
  ON public.nozzle_metrology_verifications (posto_id, verified_at DESC);

ALTER TABLE public.nozzle_metrology_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nozzle_metrology_verifications_select_own"
  ON public.nozzle_metrology_verifications FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "nozzle_metrology_verifications_insert_own"
  ON public.nozzle_metrology_verifications FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "nozzle_metrology_verifications_delete_own"
  ON public.nozzle_metrology_verifications FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE TABLE public.nozzle_metrology_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL
    REFERENCES public.nozzle_metrology_verifications(id) ON DELETE CASCADE,
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  nozzle_number integer NOT NULL,
  fuel_product_key text NOT NULL,
  fuel_other_label text,
  volumetry_min integer NOT NULL,
  volumetry_max integer NOT NULL,
  flow_min_seconds numeric(10, 2) NOT NULL,
  flow_max_seconds numeric(10, 2) NOT NULL,
  seals_ok boolean NOT NULL,
  leakage boolean NOT NULL,
  item_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nozzle_metrology_items_number_check
    CHECK (nozzle_number >= 1),
  CONSTRAINT nozzle_metrology_items_fuel_check
    CHECK (
      (fuel_product_key = 'outro' AND length(trim(coalesce(fuel_other_label, ''))) > 0)
      OR (fuel_product_key <> 'outro' AND fuel_other_label IS NULL)
    ),
  CONSTRAINT nozzle_metrology_items_volumetry_step_check
    CHECK (
      volumetry_min BETWEEN -200 AND 200
      AND volumetry_max BETWEEN -200 AND 200
      AND mod(volumetry_min, 20) = 0
      AND mod(volumetry_max, 20) = 0
    ),
  CONSTRAINT nozzle_metrology_items_flow_check
    CHECK (flow_min_seconds > 0 AND flow_max_seconds > 0),
  CONSTRAINT nozzle_metrology_items_status_check
    CHECK (item_status IN ('aprovado', 'reprovado')),
  CONSTRAINT nozzle_metrology_items_unique_nozzle
    UNIQUE (verification_id, nozzle_number)
);

CREATE INDEX nozzle_metrology_items_verification_idx
  ON public.nozzle_metrology_items (verification_id, nozzle_number);

CREATE INDEX nozzle_metrology_items_posto_idx
  ON public.nozzle_metrology_items (posto_id);

ALTER TABLE public.nozzle_metrology_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nozzle_metrology_items_select_own"
  ON public.nozzle_metrology_items FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "nozzle_metrology_items_insert_own"
  ON public.nozzle_metrology_items FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
    AND verification_id IN (
      SELECT v.id
      FROM public.nozzle_metrology_verifications v
      WHERE v.posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'nozzle-metrology',
  'nozzle-metrology',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "nozzle_metrology_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'nozzle-metrology'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "nozzle_metrology_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'nozzle-metrology'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "nozzle_metrology_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'nozzle-metrology'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
