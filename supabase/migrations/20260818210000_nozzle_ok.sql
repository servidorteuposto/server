-- Inspeção visual: bico de acordo (PORTARIA 227/2022)

ALTER TABLE public.nozzle_metrology_items
  ADD COLUMN IF NOT EXISTS nozzle_ok boolean;

UPDATE public.nozzle_metrology_items
SET nozzle_ok = true
WHERE nozzle_ok IS NULL
  AND fuel_product_key <> 'manutencao';

ALTER TABLE public.nozzle_metrology_items
  DROP CONSTRAINT IF EXISTS nozzle_metrology_items_required_when_fuel_check;

ALTER TABLE public.nozzle_metrology_items
  ADD CONSTRAINT nozzle_metrology_items_required_when_fuel_check
  CHECK (
    fuel_product_key = 'manutencao'
    OR (
      volumetry_min IS NOT NULL
      AND volumetry_max IS NOT NULL
      AND flow_min_liters IS NOT NULL
      AND flow_max_liters IS NOT NULL
      AND seals_ok IS NOT NULL
      AND leakage IS NOT NULL
      AND hose_ok IS NOT NULL
      AND display_burned IS NOT NULL
      AND nozzle_ok IS NOT NULL
    )
  );
