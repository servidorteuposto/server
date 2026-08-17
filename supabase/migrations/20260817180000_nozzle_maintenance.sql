-- Bico em manutenção: medições opcionais e status próprio

ALTER TABLE public.nozzle_metrology_items
  ALTER COLUMN volumetry_min DROP NOT NULL,
  ALTER COLUMN volumetry_max DROP NOT NULL,
  ALTER COLUMN flow_min_liters DROP NOT NULL,
  ALTER COLUMN flow_max_liters DROP NOT NULL,
  ALTER COLUMN seals_ok DROP NOT NULL,
  ALTER COLUMN leakage DROP NOT NULL,
  ALTER COLUMN hose_ok DROP NOT NULL,
  ALTER COLUMN display_burned DROP NOT NULL;

ALTER TABLE public.nozzle_metrology_items
  DROP CONSTRAINT IF EXISTS nozzle_metrology_items_status_check;

ALTER TABLE public.nozzle_metrology_items
  ADD CONSTRAINT nozzle_metrology_items_status_check
  CHECK (item_status IN ('aprovado', 'reprovado', 'manutencao'));

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
    )
  );
