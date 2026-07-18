-- Remove obrigatoriedade de CPF nas assinaturas (RAQ e drenagens)

ALTER TABLE public.fuel_analysis_reports
  ALTER COLUMN author_cpf DROP NOT NULL;

ALTER TABLE public.diesel_drainage_reports
  DROP CONSTRAINT IF EXISTS diesel_drainage_reports_operator_cpf_check;

ALTER TABLE public.diesel_drainage_reports
  ALTER COLUMN operator_cpf DROP NOT NULL;
