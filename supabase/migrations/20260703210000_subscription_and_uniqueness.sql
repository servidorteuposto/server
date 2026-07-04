-- Status de assinatura e unicidade de cadastro
ALTER TABLE public.postos
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'pending_payment'
    CHECK (subscription_status IN ('pending_payment', 'active', 'expired')),
  ADD COLUMN IF NOT EXISTS subscription_ends_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS postos_email_key ON public.postos (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS postos_telefone_key ON public.postos (regexp_replace(telefone, '\D', '', 'g'));

CREATE OR REPLACE FUNCTION public.normalize_posto_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
$$;

-- Verifica disponibilidade de CNPJ, e-mail e telefone para novo cadastro
CREATE OR REPLACE FUNCTION public.check_registration_availability(
  p_cnpj text,
  p_email text,
  p_telefone text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnpj text := regexp_replace(p_cnpj, '\D', '', 'g');
  v_phone text := normalize_posto_phone(p_telefone);
  v_email text := lower(trim(p_email));
  v_posto public.postos%ROWTYPE;
BEGIN
  SELECT * INTO v_posto
  FROM public.postos
  WHERE regexp_replace(cnpj, '\D', '', 'g') = v_cnpj
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'available', false,
      'field', 'cnpj',
      'subscription_status', v_posto.subscription_status
    );
  END IF;

  SELECT * INTO v_posto
  FROM public.postos
  WHERE lower(email) = v_email
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'available', false,
      'field', 'email',
      'subscription_status', v_posto.subscription_status
    );
  END IF;

  SELECT * INTO v_posto
  FROM public.postos
  WHERE normalize_posto_phone(telefone) = v_phone
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'available', false,
      'field', 'telefone',
      'subscription_status', v_posto.subscription_status
    );
  END IF;

  RETURN json_build_object('available', true, 'field', null);
END;
$$;

-- Consulta status da conta antes do login (por e-mail ou CNPJ)
CREATE OR REPLACE FUNCTION public.get_account_access_by_identifier(p_identifier text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posto public.postos%ROWTYPE;
  v_trimmed text := trim(p_identifier);
  v_status text;
BEGIN
  IF v_trimmed IS NULL OR v_trimmed = '' THEN
    RETURN json_build_object('found', false);
  END IF;

  IF position('@' IN v_trimmed) > 0 THEN
    SELECT * INTO v_posto FROM public.postos WHERE lower(email) = lower(v_trimmed) LIMIT 1;
  ELSE
    SELECT * INTO v_posto
    FROM public.postos
    WHERE regexp_replace(cnpj, '\D', '', 'g') = regexp_replace(v_trimmed, '\D', '', 'g')
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  v_status := v_posto.subscription_status;

  IF v_status = 'active' AND v_posto.subscription_ends_at IS NOT NULL AND v_posto.subscription_ends_at < now() THEN
    UPDATE public.postos
    SET subscription_status = 'expired', updated_at = now()
    WHERE id = v_posto.id;

    v_status := 'expired';
  END IF;

  RETURN json_build_object(
    'found', true,
    'subscription_status', v_status,
    'nome', v_posto.nome,
    'cnpj', v_posto.cnpj,
    'telefone', v_posto.telefone,
    'email', v_posto.email
  );
END;
$$;

-- Ativa assinatura após pagamento (30 dias corridos)
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
  WHERE regexp_replace(cnpj, '\D', '', 'g') = regexp_replace(p_cnpj, '\D', '', 'g');
END;
$$;

-- Assinatura do usuário autenticado (com expiração automática)
CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posto public.postos%ROWTYPE;
  v_status text;
BEGIN
  SELECT * INTO v_posto
  FROM public.postos
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('found', false);
  END IF;

  v_status := v_posto.subscription_status;

  IF v_status = 'active' AND v_posto.subscription_ends_at IS NOT NULL AND v_posto.subscription_ends_at < now() THEN
    UPDATE public.postos
    SET subscription_status = 'expired', updated_at = now()
    WHERE id = v_posto.id;

    v_status := 'expired';
  END IF;

  RETURN json_build_object(
    'found', true,
    'subscription_status', v_status,
    'subscription_ends_at', v_posto.subscription_ends_at,
    'is_read_only', v_status = 'expired'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_registration_availability(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_account_access_by_identifier(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_subscription(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_subscription() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.check_registration_availability(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_access_by_identifier(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;
