-- Página pública: metadados do responsável por combustível + storage do latest-per-product

CREATE OR REPLACE FUNCTION public.is_public_fuel_storage_path(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH latest_raq AS (
    SELECT DISTINCT ON (q.product_key)
      q.report_id,
      q.invoice_storage_path,
      r.posto_id,
      r.signature_storage_path
    FROM public.fuel_analysis_raq_items q
    INNER JOIN public.fuel_analysis_reports r ON r.id = q.report_id
    ORDER BY q.product_key, r.submitted_at DESC
  ),
  latest_analysis AS (
    SELECT DISTINCT ON (a.product_key)
      a.report_id,
      a.photo_storage_path,
      r.posto_id,
      r.signature_storage_path
    FROM public.fuel_analysis_items a
    INNER JOIN public.fuel_analysis_reports r ON r.id = a.report_id
    ORDER BY a.product_key, r.submitted_at DESC
  )
  SELECT EXISTS (
    SELECT 1
    FROM latest_analysis la
    WHERE la.photo_storage_path = object_name
       OR la.signature_storage_path = object_name
  )
  OR EXISTS (
    SELECT 1
    FROM latest_raq lr
    WHERE lr.invoice_storage_path = object_name
       OR lr.signature_storage_path = object_name
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
      SELECT jsonb_agg(row_data ORDER BY row_data->>'product_key')
      FROM (
        SELECT DISTINCT ON (q.product_key)
          to_jsonb(q) || jsonb_build_object(
            'author_full_name', r.author_full_name,
            'signature_storage_path', r.signature_storage_path,
            'report_submitted_at', r.submitted_at
          ) AS row_data
        FROM public.fuel_analysis_raq_items q
        INNER JOIN public.fuel_analysis_reports r ON r.id = q.report_id
        WHERE r.posto_id = v_posto.id
        ORDER BY q.product_key, r.submitted_at DESC
      ) AS enriched
    ), '[]'::jsonb),
    'analysis_items', COALESCE((
      SELECT jsonb_agg(row_data ORDER BY row_data->>'product_key')
      FROM (
        SELECT DISTINCT ON (a.product_key)
          to_jsonb(a) || jsonb_build_object(
            'author_full_name', r.author_full_name,
            'signature_storage_path', r.signature_storage_path,
            'report_submitted_at', r.submitted_at
          ) AS row_data
        FROM public.fuel_analysis_items a
        INNER JOIN public.fuel_analysis_reports r ON r.id = a.report_id
        WHERE r.posto_id = v_posto.id
        ORDER BY a.product_key, r.submitted_at DESC
      ) AS enriched
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;
