-- Cadastro direto: transportadores e distribuidores do posto

CREATE TABLE public.posto_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  partner_type text NOT NULL,
  razao_social text NOT NULL,
  cnpj text NOT NULL,
  telefone text,
  endereco text,
  cep text,
  logradouro text,
  numero text,
  bairro text,
  cidade text,
  uf text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posto_partners_type_check
    CHECK (partner_type IN ('transporter', 'distributor')),
  CONSTRAINT posto_partners_razao_social_check
    CHECK (length(trim(razao_social)) > 0),
  CONSTRAINT posto_partners_cnpj_check
    CHECK (cnpj ~ '^\d{14}$'),
  CONSTRAINT posto_partners_cep_check
    CHECK (cep IS NULL OR cep ~ '^\d{8}$'),
  CONSTRAINT posto_partners_uf_check
    CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$')
);

CREATE UNIQUE INDEX posto_partners_posto_type_cnpj_idx
  ON public.posto_partners (posto_id, partner_type, cnpj);

CREATE INDEX posto_partners_posto_type_idx
  ON public.posto_partners (posto_id, partner_type);

CREATE INDEX posto_partners_razao_social_idx
  ON public.posto_partners (posto_id, partner_type, lower(razao_social));

ALTER TABLE public.posto_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posto_partners_select_own"
  ON public.posto_partners FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "posto_partners_insert_own"
  ON public.posto_partners FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "posto_partners_update_own"
  ON public.posto_partners FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "posto_partners_delete_own"
  ON public.posto_partners FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_posto_partners_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER posto_partners_updated_at
  BEFORE UPDATE ON public.posto_partners
  FOR EACH ROW
  EXECUTE FUNCTION public.set_posto_partners_updated_at();
