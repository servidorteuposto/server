-- Página pública: último RAQ/análise por combustível (chegadas de caminhão separadas)

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
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.product_key)
      FROM (
        SELECT DISTINCT ON (q.product_key) q.*
        FROM public.fuel_analysis_raq_items q
        INNER JOIN public.fuel_analysis_reports r ON r.id = q.report_id
        WHERE r.posto_id = v_posto.id
        ORDER BY q.product_key, r.submitted_at DESC
      ) AS row_data
    ), '[]'::jsonb),
    'analysis_items', COALESCE((
      SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.product_key)
      FROM (
        SELECT DISTINCT ON (a.product_key) a.*
        FROM public.fuel_analysis_items a
        INNER JOIN public.fuel_analysis_reports r ON r.id = a.report_id
        WHERE r.posto_id = v_posto.id
        ORDER BY a.product_key, r.submitted_at DESC
      ) AS row_data
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;
