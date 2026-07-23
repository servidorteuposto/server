    -- Foto ao vivo + GPS + datetime em cada relatório de drenagem (padrão RAQ)

    ALTER TABLE public.diesel_drainage_reports
      ADD COLUMN IF NOT EXISTS photo_storage_path text,
      ADD COLUMN IF NOT EXISTS photo_file_name text,
      ADD COLUMN IF NOT EXISTS photo_latitude double precision,
      ADD COLUMN IF NOT EXISTS photo_longitude double precision,
      ADD COLUMN IF NOT EXISTS photo_captured_at timestamptz;

    ALTER TABLE public.diesel_drainage_reports
      DROP CONSTRAINT IF EXISTS diesel_drainage_reports_photo_coords_check;

    ALTER TABLE public.diesel_drainage_reports
      ADD CONSTRAINT diesel_drainage_reports_photo_coords_check
      CHECK (
        (photo_latitude IS NULL AND photo_longitude IS NULL)
        OR (
          photo_latitude IS NOT NULL
          AND photo_longitude IS NOT NULL
          AND photo_latitude BETWEEN -90 AND 90
          AND photo_longitude BETWEEN -180 AND 180
        )
      );

    -- Alinha limite do bucket ao tamanho de foto do RAQ (10 MB)
    UPDATE storage.buckets
    SET file_size_limit = 10485760
    WHERE id = 'diesel-drainages';
