-- Rascunhos de lançamento (RAQ e metrologia) vinculados ao posto, não ao dispositivo.

CREATE TABLE public.posto_form_drafts (
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posto_form_drafts_pkey PRIMARY KEY (posto_id, kind),
  CONSTRAINT posto_form_drafts_kind_check
    CHECK (kind IN ('fuel_raq', 'nozzle_metrology'))
);

ALTER TABLE public.posto_form_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posto_form_drafts_select_own"
  ON public.posto_form_drafts FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "posto_form_drafts_insert_own"
  ON public.posto_form_drafts FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "posto_form_drafts_update_own"
  ON public.posto_form_drafts FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "posto_form_drafts_delete_own"
  ON public.posto_form_drafts FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_posto_form_drafts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER posto_form_drafts_set_updated_at
  BEFORE UPDATE ON public.posto_form_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_posto_form_drafts_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.posto_form_drafts TO authenticated;
