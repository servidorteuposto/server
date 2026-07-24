-- Equipamentos obrigatórios do posto (1 registro por tipo)

CREATE TABLE public.mandatory_equipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  equipment_key text NOT NULL,
  serial_number text,
  brand text,
  equipment_photo_path text,
  equipment_photo_name text,
  equipment_photo_latitude double precision,
  equipment_photo_longitude double precision,
  equipment_photo_captured_at timestamptz,
  extra_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  certificate_path text,
  certificate_name text,
  certificate_mime text,
  serial_photo_path text,
  serial_photo_name text,
  serial_photo_latitude double precision,
  serial_photo_longitude double precision,
  serial_photo_captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mandatory_equipments_key_not_blank
    CHECK (length(trim(equipment_key)) > 0),
  CONSTRAINT mandatory_equipments_equipment_photo_coords_check
    CHECK (
      (equipment_photo_latitude IS NULL AND equipment_photo_longitude IS NULL)
      OR (
        equipment_photo_latitude IS NOT NULL
        AND equipment_photo_longitude IS NOT NULL
        AND equipment_photo_latitude BETWEEN -90 AND 90
        AND equipment_photo_longitude BETWEEN -180 AND 180
      )
    ),
  CONSTRAINT mandatory_equipments_serial_photo_coords_check
    CHECK (
      (serial_photo_latitude IS NULL AND serial_photo_longitude IS NULL)
      OR (
        serial_photo_latitude IS NOT NULL
        AND serial_photo_longitude IS NOT NULL
        AND serial_photo_latitude BETWEEN -90 AND 90
        AND serial_photo_longitude BETWEEN -180 AND 180
      )
    ),
  CONSTRAINT mandatory_equipments_posto_key_unique
    UNIQUE (posto_id, equipment_key)
);

CREATE INDEX mandatory_equipments_posto_idx
  ON public.mandatory_equipments (posto_id);

CREATE OR REPLACE FUNCTION public.set_mandatory_equipments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER mandatory_equipments_updated_at
  BEFORE UPDATE ON public.mandatory_equipments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_mandatory_equipments_updated_at();

ALTER TABLE public.mandatory_equipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mandatory_equipments_select_own"
  ON public.mandatory_equipments FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "mandatory_equipments_insert_own"
  ON public.mandatory_equipments FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "mandatory_equipments_update_own"
  ON public.mandatory_equipments FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "mandatory_equipments_delete_own"
  ON public.mandatory_equipments FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mandatory-equipments',
  'mandatory-equipments',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "mandatory_equipments_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'mandatory-equipments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mandatory_equipments_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'mandatory-equipments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mandatory_equipments_storage_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'mandatory-equipments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'mandatory-equipments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mandatory_equipments_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'mandatory-equipments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
