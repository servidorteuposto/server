-- Foto avulsa opcional da bomba na verificação metrológica

ALTER TABLE public.nozzle_metrology_verifications
  ADD COLUMN IF NOT EXISTS pump_photo_storage_path text,
  ADD COLUMN IF NOT EXISTS pump_photo_file_name text,
  ADD COLUMN IF NOT EXISTS pump_photo_latitude double precision,
  ADD COLUMN IF NOT EXISTS pump_photo_longitude double precision,
  ADD COLUMN IF NOT EXISTS pump_photo_captured_at timestamptz;

ALTER TABLE public.nozzle_metrology_verifications
  DROP CONSTRAINT IF EXISTS nozzle_metrology_verifications_pump_photo_check;

ALTER TABLE public.nozzle_metrology_verifications
  ADD CONSTRAINT nozzle_metrology_verifications_pump_photo_check
  CHECK (
    (
      pump_photo_storage_path IS NULL
      AND pump_photo_file_name IS NULL
      AND pump_photo_latitude IS NULL
      AND pump_photo_longitude IS NULL
      AND pump_photo_captured_at IS NULL
    )
    OR (
      pump_photo_storage_path IS NOT NULL
      AND length(trim(pump_photo_storage_path)) > 0
      AND pump_photo_latitude BETWEEN -90 AND 90
      AND pump_photo_longitude BETWEEN -180 AND 180
      AND pump_photo_captured_at IS NOT NULL
    )
  );
