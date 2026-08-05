-- Quinto WhatsApp para contatos de aviso

ALTER TABLE public.postos
  ADD COLUMN IF NOT EXISTS aviso_whatsapp_5 text;

ALTER TABLE public.postos
  DROP CONSTRAINT IF EXISTS postos_aviso_whatsapp_5_format_check;

ALTER TABLE public.postos
  ADD CONSTRAINT postos_aviso_whatsapp_5_format_check
  CHECK (
    aviso_whatsapp_5 IS NULL
    OR length(regexp_replace(aviso_whatsapp_5, '\D', '', 'g')) BETWEEN 10 AND 13
  );

-- Inclui o 5º número nos alertas de bloqueio de login
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
  v_phones text[];
  v_primary_phone text;
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
      SELECT array_agg(DISTINCT phone)
      INTO v_phones
      FROM (
        SELECT nullif(regexp_replace(trim(p), '\D', '', 'g'), '') AS phone
        FROM unnest(ARRAY[
          v_posto.aviso_whatsapp_1,
          v_posto.aviso_whatsapp_2,
          v_posto.aviso_whatsapp_3,
          v_posto.aviso_whatsapp_4,
          v_posto.aviso_whatsapp_5
        ]) AS p
      ) phones
      WHERE phone IS NOT NULL
        AND length(phone) BETWEEN 10 AND 13;

      IF v_phones IS NULL OR cardinality(v_phones) = 0 THEN
        v_primary_phone := nullif(regexp_replace(COALESCE(v_posto.telefone, ''), '\D', '', 'g'), '');
        IF v_primary_phone IS NOT NULL THEN
          v_phones := ARRAY[v_primary_phone];
        ELSE
          v_phones := ARRAY[]::text[];
        END IF;
      ELSE
        v_primary_phone := v_phones[1];
      END IF;

      INSERT INTO auth_security.security_alerts (identifier_key, alert_type, email, phone, payload)
      VALUES (
        v_key,
        'account_locked',
        v_posto.email,
        v_primary_phone,
        json_build_object(
          'nome', v_posto.nome,
          'cnpj', v_posto.cnpj,
          'failed_count', v_row.failed_count,
          'phones', COALESCE(to_json(v_phones), '[]'::json)
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
