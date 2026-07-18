-- Campos adicionais do relatório de drenagem de diesel

ALTER TABLE public.diesel_drainage_reports
  ADD COLUMN IF NOT EXISTS water_present boolean,
  ADD COLUMN IF NOT EXISTS impurities_present boolean,
  ADD COLUMN IF NOT EXISTS drained_volume_liters numeric(12, 2),
  ADD COLUMN IF NOT EXISTS measure_taken text;

ALTER TABLE public.diesel_drainage_reports
  DROP CONSTRAINT IF EXISTS diesel_drainage_reports_drained_volume_check;

ALTER TABLE public.diesel_drainage_reports
  ADD CONSTRAINT diesel_drainage_reports_drained_volume_check
  CHECK (drained_volume_liters IS NULL OR drained_volume_liters >= 0);

ALTER TABLE public.diesel_drainage_reports
  DROP CONSTRAINT IF EXISTS diesel_drainage_reports_measure_taken_check;

ALTER TABLE public.diesel_drainage_reports
  ADD CONSTRAINT diesel_drainage_reports_measure_taken_check
  CHECK (measure_taken IS NULL OR length(trim(measure_taken)) > 0);
