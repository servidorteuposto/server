-- Endereço estruturado no cadastro direto (CEP / ViaCEP)

ALTER TABLE public.posto_partners
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS uf text;

ALTER TABLE public.posto_partners
  DROP CONSTRAINT IF EXISTS posto_partners_cep_check;

ALTER TABLE public.posto_partners
  ADD CONSTRAINT posto_partners_cep_check
  CHECK (cep IS NULL OR cep ~ '^\d{8}$');

ALTER TABLE public.posto_partners
  DROP CONSTRAINT IF EXISTS posto_partners_uf_check;

ALTER TABLE public.posto_partners
  ADD CONSTRAINT posto_partners_uf_check
  CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$');
