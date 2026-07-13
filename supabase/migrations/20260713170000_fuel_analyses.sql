-- Análises de Combustíveis (RAQ + laudos) + endereço do posto

ALTER TABLE public.postos
  ADD COLUMN IF NOT EXISTS endereco text;

CREATE TABLE public.fuel_product_settings (
  posto_id uuid PRIMARY KEY REFERENCES public.postos(id) ON DELETE CASCADE,
  products text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fuel_product_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_product_settings_select_own"
  ON public.fuel_product_settings FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "fuel_product_settings_insert_own"
  ON public.fuel_product_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "fuel_product_settings_update_own"
  ON public.fuel_product_settings FOR UPDATE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE TABLE public.fuel_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid NOT NULL REFERENCES public.postos(id) ON DELETE CASCADE,
  razao_social text NOT NULL,
  cnpj text NOT NULL,
  endereco text NOT NULL,
  author_full_name text NOT NULL,
  author_cpf text NOT NULL,
  signature_storage_path text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fuel_analysis_reports_posto_id_idx
  ON public.fuel_analysis_reports (posto_id);

CREATE INDEX fuel_analysis_reports_submitted_at_idx
  ON public.fuel_analysis_reports (posto_id, submitted_at DESC);

ALTER TABLE public.fuel_analysis_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_analysis_reports_select_own"
  ON public.fuel_analysis_reports FOR SELECT
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "fuel_analysis_reports_insert_own"
  ON public.fuel_analysis_reports FOR INSERT
  TO authenticated
  WITH CHECK (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE POLICY "fuel_analysis_reports_delete_own"
  ON public.fuel_analysis_reports FOR DELETE
  TO authenticated
  USING (
    posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.set_fuel_analysis_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER fuel_analysis_reports_updated_at
  BEFORE UPDATE ON public.fuel_analysis_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_fuel_analysis_reports_updated_at();

CREATE TABLE public.fuel_analysis_raq_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.fuel_analysis_reports(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  volume_received_liters numeric,
  collection_date date,
  transporter_name text,
  transporter_cnpj text,
  invoice_number text,
  invoice_storage_path text,
  invoice_file_name text,
  truck_plate text,
  driver_name text,
  distributor_name text,
  distributor_cnpj text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuel_analysis_raq_items_unique UNIQUE (report_id, product_key)
);

CREATE INDEX fuel_analysis_raq_items_report_id_idx
  ON public.fuel_analysis_raq_items (report_id);

ALTER TABLE public.fuel_analysis_raq_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_analysis_raq_items_select_own"
  ON public.fuel_analysis_raq_items FOR SELECT
  TO authenticated
  USING (
    report_id IN (
      SELECT r.id FROM public.fuel_analysis_reports r
      WHERE r.posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "fuel_analysis_raq_items_insert_own"
  ON public.fuel_analysis_raq_items FOR INSERT
  TO authenticated
  WITH CHECK (
    report_id IN (
      SELECT r.id FROM public.fuel_analysis_reports r
      WHERE r.posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "fuel_analysis_raq_items_delete_own"
  ON public.fuel_analysis_raq_items FOR DELETE
  TO authenticated
  USING (
    report_id IN (
      SELECT r.id FROM public.fuel_analysis_reports r
      WHERE r.posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
    )
  );

CREATE TABLE public.fuel_analysis_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.fuel_analysis_reports(id) ON DELETE CASCADE,
  product_key text NOT NULL,
  aspecto text,
  cor text,
  temperatura_observada text,
  massa_especifica_observada text,
  massa_especifica_convertida text,
  teor_alcool_gasolina text,
  photo_storage_path text,
  photo_file_name text,
  photo_latitude double precision,
  photo_longitude double precision,
  photo_captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuel_analysis_items_unique UNIQUE (report_id, product_key)
);

CREATE INDEX fuel_analysis_items_report_id_idx
  ON public.fuel_analysis_items (report_id);

ALTER TABLE public.fuel_analysis_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fuel_analysis_items_select_own"
  ON public.fuel_analysis_items FOR SELECT
  TO authenticated
  USING (
    report_id IN (
      SELECT r.id FROM public.fuel_analysis_reports r
      WHERE r.posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "fuel_analysis_items_insert_own"
  ON public.fuel_analysis_items FOR INSERT
  TO authenticated
  WITH CHECK (
    report_id IN (
      SELECT r.id FROM public.fuel_analysis_reports r
      WHERE r.posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "fuel_analysis_items_delete_own"
  ON public.fuel_analysis_items FOR DELETE
  TO authenticated
  USING (
    report_id IN (
      SELECT r.id FROM public.fuel_analysis_reports r
      WHERE r.posto_id IN (SELECT id FROM public.postos WHERE user_id = auth.uid())
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fuel-analyses',
  'fuel-analyses',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "fuel_analyses_storage_select_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'fuel-analyses'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "fuel_analyses_storage_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'fuel-analyses'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "fuel_analyses_storage_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'fuel-analyses'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'fuel-analyses'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "fuel_analyses_storage_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'fuel-analyses'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.postos WHERE user_id = auth.uid()
    )
  );
