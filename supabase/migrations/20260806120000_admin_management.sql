-- Admin management settings + metrics RPC (service_role only)

CREATE TABLE IF NOT EXISTS public.admin_management_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  alert_whatsapp_1 text,
  alert_whatsapp_2 text,
  domain_expires_on date,
  quotas jsonb NOT NULL DEFAULT jsonb_build_object(
    'db_bytes', 8589934592,
    'storage_bytes', 107374182400,
    'vercel_bandwidth_bytes', 107374182400
  ),
  last_alerts jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.admin_management_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.admin_management_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_management_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_management_settings FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_management_settings TO service_role;

COMMENT ON TABLE public.admin_management_settings IS
  'Singleton de configuração do painel Gerenciamento (admin). Acesso só via service_role.';

-- Métricas agregadas para o painel (DB size, storage, fluxo do dia)
CREATE OR REPLACE FUNCTION public.admin_management_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, auth_security, pg_catalog
AS $$
DECLARE
  v_today date;
  v_db_bytes bigint;
  v_storage_total bigint;
  v_tables jsonb;
  v_buckets jsonb;
  v_flow jsonb;
BEGIN
  v_today := (timezone('America/Sao_Paulo', now()))::date;

  SELECT pg_database_size(current_database()) INTO v_db_bytes;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.bytes DESC), '[]'::jsonb)
  INTO v_tables
  FROM (
    SELECT
      n.nspname AS schema,
      c.relname AS name,
      pg_total_relation_size(c.oid)::bigint AS bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'm')
      AND n.nspname IN ('public', 'auth_security', 'storage')
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 20
  ) t;

  SELECT COALESCE(SUM((o.metadata->>'size')::bigint), 0)
  INTO v_storage_total
  FROM storage.objects o;

  SELECT COALESCE(jsonb_agg(row_to_json(b)::jsonb ORDER BY b.bytes DESC), '[]'::jsonb)
  INTO v_buckets
  FROM (
    SELECT
      o.bucket_id AS bucket,
      COALESCE(SUM((o.metadata->>'size')::bigint), 0)::bigint AS bytes,
      COUNT(*)::bigint AS objects
    FROM storage.objects o
    GROUP BY o.bucket_id
  ) b;

  v_flow := jsonb_build_object(
    'postos', (
      SELECT COUNT(*)::bigint FROM public.postos
      WHERE (timezone('America/Sao_Paulo', created_at))::date = v_today
    ),
    'regulatory_documents', (
      SELECT COUNT(*)::bigint FROM public.regulatory_documents
      WHERE (timezone('America/Sao_Paulo', created_at))::date = v_today
    ),
    'work_safety_documents', (
      SELECT COUNT(*)::bigint FROM public.work_safety_documents
      WHERE (timezone('America/Sao_Paulo', created_at))::date = v_today
    ),
    'fuel_analysis_reports', (
      SELECT COUNT(*)::bigint FROM public.fuel_analysis_reports
      WHERE (timezone('America/Sao_Paulo', created_at))::date = v_today
    ),
    'diesel_drainage_reports', (
      SELECT COUNT(*)::bigint FROM public.diesel_drainage_reports
      WHERE (timezone('America/Sao_Paulo', created_at))::date = v_today
    ),
    'nozzle_metrology_verifications', (
      SELECT COUNT(*)::bigint FROM public.nozzle_metrology_verifications
      WHERE (timezone('America/Sao_Paulo', created_at))::date = v_today
    ),
    'support_tickets', (
      SELECT COUNT(*)::bigint FROM public.support_tickets
      WHERE (timezone('America/Sao_Paulo', created_at))::date = v_today
    ),
    'mp_payments', (
      SELECT COUNT(*)::bigint FROM public.mp_payments
      WHERE (timezone('America/Sao_Paulo', created_at))::date = v_today
    ),
    'security_alerts', (
      SELECT COUNT(*)::bigint FROM auth_security.security_alerts
      WHERE (timezone('America/Sao_Paulo', created_at))::date = v_today
    ),
    'registration_attempts', (
      SELECT COUNT(*)::bigint FROM auth_security.registration_attempts
      WHERE (timezone('America/Sao_Paulo', created_at))::date = v_today
    ),
    'whatsapp_reminder_sends', (
      SELECT COUNT(*)::bigint FROM public.whatsapp_reminder_sends
      WHERE sent_on = v_today
    )
  );

  RETURN jsonb_build_object(
    'today', v_today::text,
    'db_bytes', v_db_bytes,
    'storage_bytes', v_storage_total,
    'tables', v_tables,
    'buckets', v_buckets,
    'flow_today', v_flow
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_management_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_management_metrics() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_management_metrics() TO service_role;
