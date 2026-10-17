-- Foto da verificação metrológica deixa de ser obrigatória

ALTER TABLE public.nozzle_metrology_verifications
  ALTER COLUMN photo_storage_path DROP NOT NULL,
  ALTER COLUMN photo_latitude DROP NOT NULL,
  ALTER COLUMN photo_longitude DROP NOT NULL,
  ALTER COLUMN photo_captured_at DROP NOT NULL;

ALTER TABLE public.nozzle_metrology_verifications
  DROP CONSTRAINT IF EXISTS nozzle_metrology_verifications_photo_coords_check;

ALTER TABLE public.nozzle_metrology_verifications
  ADD CONSTRAINT nozzle_metrology_verifications_photo_coords_check
  CHECK (
    (
      photo_storage_path IS NULL
      AND photo_file_name IS NULL
      AND photo_latitude IS NULL
      AND photo_longitude IS NULL
      AND photo_captured_at IS NULL
    )
    OR (
      photo_storage_path IS NOT NULL
      AND length(trim(photo_storage_path)) > 0
      AND photo_latitude BETWEEN -90 AND 90
      AND photo_longitude BETWEEN -180 AND 180
      AND photo_captured_at IS NOT NULL
    )
  );
