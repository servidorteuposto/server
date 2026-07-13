-- Status de conformidade ANP da massa específica convertida a 20 °C

ALTER TABLE public.fuel_analysis_items
  ADD COLUMN IF NOT EXISTS densidade_status text
    CHECK (densidade_status IS NULL OR densidade_status IN ('apto', 'inapto')),
  ADD COLUMN IF NOT EXISTS coeficiente_gamma numeric,
  ADD COLUMN IF NOT EXISTS densidade_formula text;
