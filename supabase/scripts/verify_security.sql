-- Auditoria de segurança — Teu Posto (resultado único)
-- Cole no Supabase → SQL Editor → Run

WITH
tabelas_sem_rls AS (
  SELECT c.relname AS nome
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity IS NOT TRUE
),
tabelas_public AS (
  SELECT count(*) AS total
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
),
tabelas_com_rls AS (
  SELECT count(*) AS total
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity IS TRUE
),
tabelas_sem_policy AS (
  SELECT c.relname AS nome
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = c.relname
    )
),
buckets_publicos AS (
  SELECT id AS nome
  FROM storage.buckets
  WHERE public IS TRUE
),
buckets_total AS (
  SELECT count(*) AS total FROM storage.buckets
),
storage_policies AS (
  SELECT count(*) AS total
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
),
activate_subscription_grants AS (
  SELECT
    bool_or(grantee = 'anon') AS anon_pode,
    bool_or(grantee = 'authenticated') AS auth_pode,
    bool_or(grantee = 'service_role') AS service_pode
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'activate_subscription'
    AND privilege_type = 'EXECUTE'
),
auth_security_exposto AS (
  SELECT count(*) AS total
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'auth_security'
    AND c.relkind = 'r'
    AND (
      has_table_privilege('anon', c.oid, 'SELECT')
      OR has_table_privilege('authenticated', c.oid, 'SELECT')
    )
)
SELECT
  1 AS ordem,
  'Tabelas public.* sem RLS' AS verificacao,
  CASE WHEN (SELECT count(*) FROM tabelas_sem_rls) = 0 THEN 'OK' ELSE 'FALHOU' END AS status,
  COALESCE((SELECT string_agg(nome, ', ') FROM tabelas_sem_rls), 'nenhuma') AS detalhe
UNION ALL
SELECT
  2,
  'Tabelas public.* com RLS',
  CASE
    WHEN (SELECT total FROM tabelas_com_rls) = (SELECT total FROM tabelas_public)
    THEN 'OK'
    ELSE 'FALHOU'
  END,
  (SELECT total::text FROM tabelas_com_rls) || ' de ' || (SELECT total::text FROM tabelas_public)
UNION ALL
SELECT
  3,
  'Tabelas public.* sem policy',
  CASE WHEN (SELECT count(*) FROM tabelas_sem_policy) = 0 THEN 'OK' ELSE 'FALHOU' END,
  COALESCE((SELECT string_agg(nome, ', ') FROM tabelas_sem_policy), 'nenhuma')
UNION ALL
SELECT
  4,
  'Buckets publicos',
  CASE WHEN (SELECT count(*) FROM buckets_publicos) = 0 THEN 'OK' ELSE 'FALHOU' END,
  COALESCE((SELECT string_agg(nome, ', ') FROM buckets_publicos), 'nenhum')
UNION ALL
SELECT
  5,
  'Total de buckets',
  'INFO',
  (SELECT total::text FROM buckets_total) || ' bucket(s)'
UNION ALL
SELECT
  6,
  'Policies de storage.objects',
  CASE WHEN (SELECT total FROM storage_policies) > 0 THEN 'OK' ELSE 'FALHOU' END,
  (SELECT total::text FROM storage_policies) || ' policy(s)'
UNION ALL
SELECT
  7,
  'activate_subscription (EXECUTE)',
  CASE
    WHEN (SELECT anon_pode OR auth_pode FROM activate_subscription_grants) THEN 'FALHOU'
    WHEN (SELECT service_pode FROM activate_subscription_grants) THEN 'OK'
    ELSE 'FALHOU'
  END,
  CASE
    WHEN (SELECT anon_pode OR auth_pode FROM activate_subscription_grants)
    THEN 'anon/authenticated ainda podem executar'
    WHEN (SELECT service_pode FROM activate_subscription_grants)
    THEN 'somente service_role'
    ELSE 'service_role sem permissao'
  END
UNION ALL
SELECT
  8,
  'auth_security exposto a anon/auth',
  CASE WHEN (SELECT total FROM auth_security_exposto) = 0 THEN 'OK' ELSE 'FALHOU' END,
  CASE
    WHEN (SELECT total FROM auth_security_exposto) = 0
    THEN 'anon e authenticated sem SELECT'
    ELSE (SELECT total::text FROM auth_security_exposto) || ' tabela(s) exposta(s)'
  END
ORDER BY ordem;
