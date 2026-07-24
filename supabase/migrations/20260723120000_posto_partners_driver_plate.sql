-- Transportador: motorista e placa opcionais para autofill no RAQ

ALTER TABLE public.posto_partners
  ADD COLUMN IF NOT EXISTS motorista text,
  ADD COLUMN IF NOT EXISTS placa text;
