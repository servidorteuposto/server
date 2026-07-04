-- Camada de segurança para autenticação e cadastro
CREATE SCHEMA IF NOT EXISTS auth_security;

CREATE TABLE IF NOT EXISTS auth_security.login_attempts (
  identifier_key text PRIMARY KEY,
  ip_hash text,
  failed_count integer NOT NULL DEFAULT 0,
  locked_at timestamptz,
  last_failed_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_security.registration_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  cnpj_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS registration_attempts_ip_created_idx
  ON auth_security.registration_attempts (ip_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS registration_attempts_cnpj_created_idx
  ON auth_security.registration_attempts (cnpj_key, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_security.security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_key text NOT NULL,
  alert_type text NOT NULL,
  email text,
  phone text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS security_alerts_unprocessed_idx
  ON auth_security.security_alerts (created_at)
  WHERE processed_at IS NULL;

REVOKE ALL ON SCHEMA auth_security FROM PUBLIC;
GRANT USAGE ON SCHEMA auth_security TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA auth_security TO service_role;

CREATE OR REPLACE FUNCTION auth_security.normalize_identifier_key(p_identifier text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_trimmed text := lower(trim(p_identifier));
  v_email text;
BEGIN
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RETURN NULL;
  END IF;

  IF position('@' IN v_trimmed) > 0 THEN
    RETURN v_trimmed;
  END IF;

  SELECT lower(email) INTO v_email
  FROM public.postos
  WHERE regexp_replace(cnpj, '\D', '', 'g') = regexp_replace(v_trimmed, '\D', '', 'g')
  LIMIT 1;

  RETURN v_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.security_get_login_state(p_identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security
AS $$
DECLARE
  v_key text := auth_security.normalize_identifier_key(p_identifier);
  v_row auth_security.login_attempts%ROWTYPE;
  v_max_attempts constant integer := 5;
BEGIN
  IF v_key IS NULL THEN
    RETURN json_build_object(
      'found', false,
      'locked', false,
      'attempts_left', v_max_attempts
    );
  END IF;

  SELECT * INTO v_row
  FROM auth_security.login_attempts
  WHERE identifier_key = v_key;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'found', true,
      'identifier_key', v_key,
      'locked', false,
      'attempts_left', v_max_attempts
    );
  END IF;

  RETURN json_build_object(
    'found', true,
    'identifier_key', v_key,
    'locked', v_row.locked_at IS NOT NULL,
    'attempts_left', GREATEST(0, v_max_attempts - v_row.failed_count),
    'failed_count', v_row.failed_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.security_record_login_failure(
  p_identifier text,
  p_ip_hash text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security
AS $$
DECLARE
  v_key text := auth_security.normalize_identifier_key(p_identifier);
  v_max_attempts constant integer := 5;
  v_row auth_security.login_attempts%ROWTYPE;
  v_posto public.postos%ROWTYPE;
  v_locked boolean := false;
  v_alert_id uuid;
BEGIN
  IF v_key IS NULL THEN
    RETURN json_build_object('locked', false, 'attempts_left', v_max_attempts);
  END IF;

  INSERT INTO auth_security.login_attempts (identifier_key, ip_hash, failed_count, last_failed_at, updated_at)
  VALUES (v_key, p_ip_hash, 1, now(), now())
  ON CONFLICT (identifier_key) DO UPDATE
  SET
    failed_count = CASE
      WHEN auth_security.login_attempts.locked_at IS NOT NULL THEN auth_security.login_attempts.failed_count
      ELSE auth_security.login_attempts.failed_count + 1
    END,
    ip_hash = COALESCE(p_ip_hash, auth_security.login_attempts.ip_hash),
    last_failed_at = now(),
    updated_at = now(),
    locked_at = CASE
      WHEN auth_security.login_attempts.locked_at IS NOT NULL THEN auth_security.login_attempts.locked_at
      WHEN auth_security.login_attempts.failed_count + 1 >= v_max_attempts THEN now()
      ELSE NULL
    END
  RETURNING * INTO v_row;

  v_locked := v_row.locked_at IS NOT NULL;

  IF v_locked AND v_row.failed_count >= v_max_attempts THEN
    SELECT * INTO v_posto FROM public.postos WHERE lower(email) = v_key LIMIT 1;

    IF FOUND THEN
      INSERT INTO auth_security.security_alerts (identifier_key, alert_type, email, phone, payload)
      VALUES (
        v_key,
        'account_locked',
        v_posto.email,
        v_posto.telefone,
        json_build_object(
          'nome', v_posto.nome,
          'cnpj', v_posto.cnpj,
          'failed_count', v_row.failed_count
        )
      )
      RETURNING id INTO v_alert_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'locked', v_locked,
    'attempts_left', GREATEST(0, v_max_attempts - v_row.failed_count),
    'alert_id', v_alert_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.security_record_login_success(p_identifier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security
AS $$
DECLARE
  v_key text := auth_security.normalize_identifier_key(p_identifier);
BEGIN
  IF v_key IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO auth_security.login_attempts (
    identifier_key, failed_count, locked_at, last_success_at, updated_at
  )
  VALUES (v_key, 0, NULL, now(), now())
  ON CONFLICT (identifier_key) DO UPDATE
  SET
    failed_count = 0,
    locked_at = NULL,
    last_success_at = now(),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.security_clear_login_lockout(p_identifier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security
AS $$
DECLARE
  v_key text := auth_security.normalize_identifier_key(p_identifier);
BEGIN
  IF v_key IS NULL THEN
    RETURN;
  END IF;

  UPDATE auth_security.login_attempts
  SET failed_count = 0, locked_at = NULL, updated_at = now()
  WHERE identifier_key = v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.security_check_registration_rate_limit(
  p_ip_hash text,
  p_cnpj text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security
AS $$
DECLARE
  v_ip_count integer;
  v_cnpj_count integer;
  v_cnpj_key text := regexp_replace(COALESCE(p_cnpj, ''), '\D', '', 'g');
  v_ip_limit constant integer := 5;
  v_cnpj_limit constant integer := 3;
  v_window constant interval := interval '1 hour';
  v_cnpj_window constant interval := interval '15 minutes';
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash = '' THEN
    RETURN json_build_object('allowed', false, 'reason', 'invalid_ip');
  END IF;

  SELECT count(*) INTO v_ip_count
  FROM auth_security.registration_attempts
  WHERE ip_hash = p_ip_hash
    AND created_at > now() - v_window;

  IF v_ip_count >= v_ip_limit THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'ip_rate_limit',
      'message', 'Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente.'
    );
  END IF;

  IF length(v_cnpj_key) = 14 THEN
    SELECT count(*) INTO v_cnpj_count
    FROM auth_security.registration_attempts
    WHERE cnpj_key = v_cnpj_key
      AND created_at > now() - v_cnpj_window;

    IF v_cnpj_count >= v_cnpj_limit THEN
      RETURN json_build_object(
        'allowed', false,
        'reason', 'cnpj_rate_limit',
        'message', 'Aguarde alguns minutos antes de tentar cadastrar este CNPJ novamente.'
      );
    END IF;
  END IF;

  RETURN json_build_object('allowed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.security_record_registration_attempt(
  p_ip_hash text,
  p_cnpj text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security
AS $$
BEGIN
  INSERT INTO auth_security.registration_attempts (ip_hash, cnpj_key)
  VALUES (
    p_ip_hash,
    regexp_replace(COALESCE(p_cnpj, ''), '\D', '', 'g')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.security_get_pending_alerts(p_limit integer DEFAULT 10)
RETURNS SETOF auth_security.security_alerts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth_security
AS $$
  SELECT *
  FROM auth_security.security_alerts
  WHERE processed_at IS NULL
  ORDER BY created_at ASC
  LIMIT GREATEST(p_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.security_mark_alert_processed(p_alert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security
AS $$
BEGIN
  UPDATE auth_security.security_alerts
  SET processed_at = now()
  WHERE id = p_alert_id;
END;
$$;

REVOKE ALL ON FUNCTION public.security_get_login_state(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_record_login_failure(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_record_login_success(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_clear_login_lockout(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_check_registration_rate_limit(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_record_registration_attempt(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_get_pending_alerts(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_mark_alert_processed(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.security_get_login_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_record_login_failure(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_record_login_success(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_clear_login_lockout(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_check_registration_rate_limit(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_record_registration_attempt(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_get_pending_alerts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.security_mark_alert_processed(uuid) TO service_role;

-- Desbloqueio após recuperação de senha (usuário autenticado)
CREATE OR REPLACE FUNCTION public.security_clear_my_login_lockout()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security
AS $$
DECLARE
  v_email text := lower(auth.jwt() ->> 'email');
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE auth_security.login_attempts
  SET failed_count = 0, locked_at = NULL, updated_at = now()
  WHERE identifier_key = v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.security_clear_my_login_lockout() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.security_clear_my_login_lockout() TO authenticated;

-- Ativação de assinatura apenas com pagamento pendente
CREATE OR REPLACE FUNCTION public.activate_subscription(p_cnpj text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.postos
  SET
    subscription_status = 'active',
    subscription_ends_at = now() + interval '30 days',
    updated_at = now()
  WHERE regexp_replace(cnpj, '\D', '', 'g') = regexp_replace(p_cnpj, '\D', '', 'g')
    AND subscription_status = 'pending_payment';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subscription_activation_not_allowed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_subscription(text) TO service_role;
