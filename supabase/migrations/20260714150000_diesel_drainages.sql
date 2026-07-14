-- Tanques de diesel + relatórios de drenagem

CREATE TABLE public.diesel_tanks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diesel_tanks_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE INDEX diesel_tanks_posto_id_idx ON public.diesel_tanks (posto_id);
CREATE UNIQUE INDEX diesel_tanks_posto_name_idx
  ON public.diesel_tanks (posto_id, lower(trim(name)));

ALTER TABLE public.diesel_tanks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diesel_tanks_select_own"
  ON public.diesel_tanks FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "diesel_tanks_insert_own"
  ON public.diesel_tanks FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "diesel_tanks_update_own"
  ON public.diesel_tanks FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "diesel_tanks_delete_own"
  ON public.diesel_tanks FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_diesel_tanks_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER diesel_tanks_updated_at
  BEFORE UPDATE ON public.diesel_tanks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_diesel_tanks_updated_at();

CREATE TABLE public.diesel_drainage_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  tank_id uuid NOT NULL REFERENCES public.diesel_tanks(id) ON DELETE RESTRICT,
  drained_at timestamptz NOT NULL DEFAULT now(),
  operator_full_name text NOT NULL,
  operator_cpf text NOT NULL,
  observations text,
  residues_confirmed boolean NOT NULL DEFAULT false,
  signature_storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diesel_drainage_reports_operator_name_check
    CHECK (length(trim(operator_full_name)) > 0),
  CONSTRAINT diesel_drainage_reports_operator_cpf_check
    CHECK (length(operator_cpf) = 11),
  CONSTRAINT diesel_drainage_reports_residues_confirmed_check
    CHECK (residues_confirmed = true)
);

CREATE INDEX diesel_drainage_reports_posto_id_idx
  ON public.diesel_drainage_reports (posto_id, drained_at DESC);

CREATE INDEX diesel_drainage_reports_tank_id_idx
  ON public.diesel_drainage_reports (tank_id);

ALTER TABLE public.diesel_drainage_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diesel_drainage_reports_select_own"
  ON public.diesel_drainage_reports FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "diesel_drainage_reports_insert_own"
  ON public.diesel_drainage_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
    AND tank_id IN (
      SELECT t.id FROM public.diesel_tanks t
      WHERE t.posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
    )
  );

-- Relatórios imutáveis após o lançamento
-- (sem UPDATE/DELETE policies)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'diesel-drainages',
  'diesel-drainages',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "diesel_drainages_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'diesel-drainages'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "diesel_drainages_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'diesel-drainages'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "diesel_drainages_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'diesel-drainages'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
