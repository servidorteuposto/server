-- Página pública do QR Code: apenas RAQ (sem documentos regulatórios)

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
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

DROP POLICY IF EXISTS "regulatory_storage_public_select" ON storage.objects;
