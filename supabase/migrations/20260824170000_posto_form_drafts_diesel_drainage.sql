-- Permite rascunho de drenagem de tanques de óleo diesel no mesmo fluxo do RAQ/metrologia.

ALTER TABLE public.posto_form_drafts
  DROP CONSTRAINT IF EXISTS posto_form_drafts_kind_check;

ALTER TABLE public.posto_form_drafts
  ADD CONSTRAINT posto_form_drafts_kind_check
  CHECK (kind IN ('fuel_raq', 'nozzle_metrology', 'diesel_drainage'));
