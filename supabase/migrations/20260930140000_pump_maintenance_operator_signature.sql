-- Nome e assinatura de quem executou a manutenção da bomba

ALTER TABLE public.pump_maintenances
  ADD COLUMN IF NOT EXISTS operator_full_name text,
  ADD COLUMN IF NOT EXISTS signature_storage_path text;

ALTER TABLE public.pump_maintenances
  DROP CONSTRAINT IF EXISTS pump_maintenances_operator_name_check;

ALTER TABLE public.pump_maintenances
  ADD CONSTRAINT pump_maintenances_operator_name_check
  CHECK (operator_full_name IS NULL OR length(trim(operator_full_name)) > 0);

ALTER TABLE public.pump_maintenances
  DROP CONSTRAINT IF EXISTS pump_maintenances_signature_path_check;

ALTER TABLE public.pump_maintenances
  ADD CONSTRAINT pump_maintenances_signature_path_check
  CHECK (signature_storage_path IS NULL OR length(trim(signature_storage_path)) > 0);
