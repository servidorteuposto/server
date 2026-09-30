-- Placas obrigatórias do posto (padrão + extras com título)

CREATE TABLE public.mandatory_plates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  plate_key text NOT NULL,
  title text NOT NULL,
  is_standard boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  photo_path text,
  photo_name text,
  photo_latitude double precision,
  photo_longitude double precision,
  photo_captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mandatory_plates_key_not_blank
    CHECK (length(trim(plate_key)) > 0),
  CONSTRAINT mandatory_plates_title_not_blank
    CHECK (length(trim(title)) > 0 AND length(trim(title)) <= 80),
  CONSTRAINT mandatory_plates_photo_coords_check
    CHECK (
      (photo_latitude IS NULL AND photo_longitude IS NULL)
      OR (
        photo_latitude IS NOT NULL
        AND photo_longitude IS NOT NULL
        AND photo_latitude BETWEEN -90 AND 90
        AND photo_longitude BETWEEN -180 AND 180
      )
    ),
  CONSTRAINT mandatory_plates_posto_key_unique
    UNIQUE (posto_id, plate_key)
);

CREATE INDEX mandatory_plates_posto_idx
  ON public.mandatory_plates (posto_id, sort_order, created_at);

CREATE OR REPLACE FUNCTION public.set_mandatory_plates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER mandatory_plates_updated_at
  BEFORE UPDATE ON public.mandatory_plates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_mandatory_plates_updated_at();

ALTER TABLE public.mandatory_plates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mandatory_plates_select_own"
  ON public.mandatory_plates FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "mandatory_plates_insert_own"
  ON public.mandatory_plates FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "mandatory_plates_update_own"
  ON public.mandatory_plates FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "mandatory_plates_delete_own"
  ON public.mandatory_plates FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mandatory-plates',
  'mandatory-plates',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "mandatory_plates_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'mandatory-plates'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mandatory_plates_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'mandatory-plates'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "mandatory_plates_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'mandatory-plates'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
