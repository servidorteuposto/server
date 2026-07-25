-- Corrige vazão: litros em vez de segundos

ALTER TABLE public.nozzle_metrology_items
  DROP CONSTRAINT IF EXISTS nozzle_metrology_items_flow_check;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nozzle_metrology_items'
      AND column_name = 'flow_min_seconds'
  ) THEN
    ALTER TABLE public.nozzle_metrology_items
      RENAME COLUMN flow_min_seconds TO flow_min_liters;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nozzle_metrology_items'
      AND column_name = 'flow_max_seconds'
  ) THEN
    ALTER TABLE public.nozzle_metrology_items
      RENAME COLUMN flow_max_seconds TO flow_max_liters;
  END IF;
END $$;

ALTER TABLE public.nozzle_metrology_items
  ADD COLUMN IF NOT EXISTS flow_min_liters numeric(10, 2);

ALTER TABLE public.nozzle_metrology_items
  ADD COLUMN IF NOT EXISTS flow_max_liters numeric(10, 2);

ALTER TABLE public.nozzle_metrology_items
  DROP CONSTRAINT IF EXISTS nozzle_metrology_items_flow_check;

ALTER TABLE public.nozzle_metrology_items
  ADD CONSTRAINT nozzle_metrology_items_flow_check
  CHECK (flow_min_liters > 0 AND flow_max_liters > 0);
