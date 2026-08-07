-- Mangueira OK e display queimado na verificação metrológica de bicos

ALTER TABLE public.nozzle_metrology_items
  ADD COLUMN IF NOT EXISTS hose_ok boolean;

ALTER TABLE public.nozzle_metrology_items
  ADD COLUMN IF NOT EXISTS display_burned boolean;

UPDATE public.nozzle_metrology_items
SET hose_ok = true
WHERE hose_ok IS NULL;

UPDATE public.nozzle_metrology_items
SET display_burned = false
WHERE display_burned IS NULL;

ALTER TABLE public.nozzle_metrology_items
  ALTER COLUMN hose_ok SET NOT NULL,
  ALTER COLUMN display_burned SET NOT NULL;
