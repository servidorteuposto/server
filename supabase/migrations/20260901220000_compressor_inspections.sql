-- Inspeção do compressor (fotos com GPS + dados do equipamento)

CREATE TABLE public.compressor_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  inspected_at timestamptz NOT NULL DEFAULT now(),
  brand text NOT NULL,
  model text NOT NULL,
  serial_number text NOT NULL,
  capacity_liters numeric NOT NULL,
  photo1_storage_path text NOT NULL,
  photo1_file_name text,
  photo1_latitude double precision NOT NULL,
  photo1_longitude double precision NOT NULL,
  photo1_captured_at timestamptz NOT NULL,
  photo2_storage_path text NOT NULL,
  photo2_file_name text,
  photo2_latitude double precision NOT NULL,
  photo2_longitude double precision NOT NULL,
  photo2_captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compressor_inspections_brand_check CHECK (length(trim(brand)) > 0),
  CONSTRAINT compressor_inspections_model_check CHECK (length(trim(model)) > 0),
  CONSTRAINT compressor_inspections_serial_check CHECK (length(trim(serial_number)) > 0),
  CONSTRAINT compressor_inspections_capacity_check CHECK (capacity_liters > 0),
  CONSTRAINT compressor_inspections_photo1_coords_check CHECK (
    photo1_latitude BETWEEN -90 AND 90
    AND photo1_longitude BETWEEN -180 AND 180
  ),
  CONSTRAINT compressor_inspections_photo2_coords_check CHECK (
    photo2_latitude BETWEEN -90 AND 90
    AND photo2_longitude BETWEEN -180 AND 180
  )
);

CREATE INDEX compressor_inspections_posto_id_idx
  ON public.compressor_inspections (posto_id, inspected_at DESC);

ALTER TABLE public.compressor_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compressor_inspections_select_own"
  ON public.compressor_inspections FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "compressor_inspections_insert_own"
  ON public.compressor_inspections FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'compressor-inspections',
  'compressor-inspections',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "compressor_inspections_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'compressor-inspections'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "compressor_inspections_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'compressor-inspections'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "compressor_inspections_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'compressor-inspections'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
