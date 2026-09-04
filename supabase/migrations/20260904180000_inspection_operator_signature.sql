-- Nome e assinatura de quem executou nas inspeções de compressor e caixa separadora

ALTER TABLE public.compressor_inspections
  ADD COLUMN IF NOT EXISTS operator_full_name text,
  ADD COLUMN IF NOT EXISTS signature_storage_path text;

ALTER TABLE public.compressor_inspections
  DROP CONSTRAINT IF EXISTS compressor_inspections_operator_name_check;

ALTER TABLE public.compressor_inspections
  ADD CONSTRAINT compressor_inspections_operator_name_check
  CHECK (operator_full_name IS NULL OR length(trim(operator_full_name)) > 0);

ALTER TABLE public.compressor_inspections
  DROP CONSTRAINT IF EXISTS compressor_inspections_signature_path_check;

ALTER TABLE public.compressor_inspections
  ADD CONSTRAINT compressor_inspections_signature_path_check
  CHECK (signature_storage_path IS NULL OR length(trim(signature_storage_path)) > 0);

ALTER TABLE public.separator_box_inspections
  ADD COLUMN IF NOT EXISTS operator_full_name text,
  ADD COLUMN IF NOT EXISTS signature_storage_path text;

ALTER TABLE public.separator_box_inspections
  DROP CONSTRAINT IF EXISTS separator_box_inspections_operator_name_check;

ALTER TABLE public.separator_box_inspections
  ADD CONSTRAINT separator_box_inspections_operator_name_check
  CHECK (operator_full_name IS NULL OR length(trim(operator_full_name)) > 0);

ALTER TABLE public.separator_box_inspections
  DROP CONSTRAINT IF EXISTS separator_box_inspections_signature_path_check;

ALTER TABLE public.separator_box_inspections
  ADD CONSTRAINT separator_box_inspections_signature_path_check
  CHECK (signature_storage_path IS NULL OR length(trim(signature_storage_path)) > 0);
