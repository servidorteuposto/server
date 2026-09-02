-- Vistoria da caixa separadora (duas fotos com GPS)

CREATE TABLE public.separator_box_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  inspected_at timestamptz NOT NULL DEFAULT now(),
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
  CONSTRAINT separator_box_inspections_photo1_coords_check CHECK (
    photo1_latitude BETWEEN -90 AND 90
    AND photo1_longitude BETWEEN -180 AND 180
  ),
  CONSTRAINT separator_box_inspections_photo2_coords_check CHECK (
    photo2_latitude BETWEEN -90 AND 90
    AND photo2_longitude BETWEEN -180 AND 180
  )
);

CREATE INDEX separator_box_inspections_posto_id_idx
  ON public.separator_box_inspections (posto_id, inspected_at DESC);

ALTER TABLE public.separator_box_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "separator_box_inspections_select_own"
  ON public.separator_box_inspections FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "separator_box_inspections_insert_own"
  ON public.separator_box_inspections FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'separator-box-inspections',
  'separator-box-inspections',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "separator_box_inspections_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'separator-box-inspections'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "separator_box_inspections_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'separator-box-inspections'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "separator_box_inspections_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'separator-box-inspections'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
