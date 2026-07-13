-- Página pública do posto (QR Code): slug + RPC + leitura de arquivos públicos

ALTER TABLE public.postos
  ADD COLUMN IF NOT EXISTS public_slug uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS postos_public_slug_key
  ON public.postos (public_slug);

-- Lançamentos de análise são imutáveis (só novas planilhas)
DROP POLICY IF EXISTS "fuel_analysis_reports_delete_own" ON public.fuel_analysis_reports;
DROP POLICY IF EXISTS "fuel_analysis_raq_items_delete_own" ON public.fuel_analysis_raq_items;
DROP POLICY IF EXISTS "fuel_analysis_items_delete_own" ON public.fuel_analysis_items;

CREATE OR REPLACE FUNCTION public.public_regulatory_template_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'alvara-prefeitura',
    'alvara-bombeiros-appci',
    'licenca-operacao-ambiental',
    'certificado-ibama',
    'alvara-sanitario',
    'certificado-revendedor-anp'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION public.is_public_regulatory_storage_path(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.regulatory_documents d
    WHERE (
        d.storage_path = object_name
        OR d.preview_storage_path = object_name
      )
      AND d.template_key = ANY (public.public_regulatory_template_keys())
  );
$$;

CREATE OR REPLACE FUNCTION public.is_public_fuel_storage_path(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.fuel_analysis_reports r
    WHERE r.submitted_at = (
        SELECT MAX(r2.submitted_at)
        FROM public.fuel_analysis_reports r2
        WHERE r2.posto_id = r.posto_id
      )
      AND (
        r.signature_storage_path = object_name
        OR EXISTS (
          SELECT 1
          FROM public.fuel_analysis_items i
          WHERE i.report_id = r.id
            AND i.photo_storage_path = object_name
        )
        OR EXISTS (
          SELECT 1
          FROM public.fuel_analysis_raq_items q
          WHERE q.report_id = r.id
            AND q.invoice_storage_path = object_name
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_public_posto_board(p_slug uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posto public.postos%ROWTYPE;
  v_report public.fuel_analysis_reports%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_posto
  FROM public.postos
  WHERE public_slug = p_slug;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_report
  FROM public.fuel_analysis_reports
  WHERE posto_id = v_posto.id
  ORDER BY submitted_at DESC
  LIMIT 1;

  v_result := jsonb_build_object(
    'posto', jsonb_build_object(
      'id', v_posto.id,
      'nome', v_posto.nome,
      'cnpj', v_posto.cnpj,
      'endereco', v_posto.endereco,
      'public_slug', v_posto.public_slug
    ),
    'report', CASE
      WHEN v_report.id IS NULL THEN NULL
      ELSE to_jsonb(v_report)
    END,
    'raq_items', COALESCE((
      SELECT jsonb_agg(to_jsonb(q) ORDER BY q.product_key)
      FROM public.fuel_analysis_raq_items q
      WHERE v_report.id IS NOT NULL AND q.report_id = v_report.id
    ), '[]'::jsonb),
    'analysis_items', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.product_key)
      FROM public.fuel_analysis_items a
      WHERE v_report.id IS NOT NULL AND a.report_id = v_report.id
    ), '[]'::jsonb),
    'documents', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'title', d.title,
          'template_key', d.template_key,
          'issued_at', d.issued_at,
          'expires_at', d.expires_at,
          'file_name', d.file_name,
          'storage_path', d.storage_path,
          'preview_storage_path', d.preview_storage_path
        )
        ORDER BY d.title
      )
      FROM public.regulatory_documents d
      WHERE d.posto_id = v_posto.id
        AND d.template_key = ANY (public.public_regulatory_template_keys())
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_posto_board(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_regulatory_template_keys() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_public_regulatory_storage_path(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_public_fuel_storage_path(text) TO anon, authenticated;

DROP POLICY IF EXISTS "regulatory_storage_public_select" ON storage.objects;
CREATE POLICY "regulatory_storage_public_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'regulatory-documents'
    AND public.is_public_regulatory_storage_path(name)
  );

DROP POLICY IF EXISTS "fuel_analyses_storage_public_select" ON storage.objects;
CREATE POLICY "fuel_analyses_storage_public_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'fuel-analyses'
    AND public.is_public_fuel_storage_path(name)
  );
