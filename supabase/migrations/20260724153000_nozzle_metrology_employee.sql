-- Caso a tabela já exista sem o nome do funcionário

ALTER TABLE public.nozzle_metrology_verifications
  ADD COLUMN IF NOT EXISTS employee_full_name text;

UPDATE public.nozzle_metrology_verifications
SET employee_full_name = 'Não informado'
WHERE employee_full_name IS NULL OR length(trim(employee_full_name)) = 0;

ALTER TABLE public.nozzle_metrology_verifications
  ALTER COLUMN employee_full_name SET NOT NULL;

ALTER TABLE public.nozzle_metrology_verifications
  DROP CONSTRAINT IF EXISTS nozzle_metrology_verifications_employee_name_check;

ALTER TABLE public.nozzle_metrology_verifications
  ADD CONSTRAINT nozzle_metrology_verifications_employee_name_check
  CHECK (length(trim(employee_full_name)) > 0);
