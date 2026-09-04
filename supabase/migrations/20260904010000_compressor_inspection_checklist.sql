-- Checklist da inspeção do compressor (Sim/Não)

ALTER TABLE public.compressor_inspections
  ADD COLUMN IF NOT EXISTS manometer_ok boolean,
  ADD COLUMN IF NOT EXISTS safety_valve_ok boolean,
  ADD COLUMN IF NOT EXISTS oil_changed boolean,
  ADD COLUMN IF NOT EXISTS compressor_drained boolean;

COMMENT ON COLUMN public.compressor_inspections.manometer_ok IS 'Manômetro OK (sim/não)';
COMMENT ON COLUMN public.compressor_inspections.safety_valve_ok IS 'Válvula de segurança OK (sim/não)';
COMMENT ON COLUMN public.compressor_inspections.oil_changed IS 'Óleo trocado (sim/não)';
COMMENT ON COLUMN public.compressor_inspections.compressor_drained IS 'Compressor drenado (sim/não)';

-- Limpeza na vistoria da caixa separadora (Sim/Não)

ALTER TABLE public.separator_box_inspections
  ADD COLUMN IF NOT EXISTS cleaning_done boolean;

COMMENT ON COLUMN public.separator_box_inspections.cleaning_done IS 'Foi feita limpeza? (sim/não)';
