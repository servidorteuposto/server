-- Telefone do posto deixa de ser obrigatório no cadastro.
-- WhatsApp fica nas configurações (3 números).

DROP INDEX IF EXISTS public.postos_telefone_key;

-- Unicidade só quando há telefone preenchido (evita conflito entre vazios)
CREATE UNIQUE INDEX postos_telefone_key
  ON public.postos (regexp_replace(telefone, '\D', '', 'g'))
  WHERE length(regexp_replace(COALESCE(telefone, ''), '\D', '', 'g')) > 0;

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

  -- Só valida unicidade de telefone se foi informado
  IF v_phone <> '' THEN
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
  END IF;

  RETURN json_build_object('available', true, 'field', null);
END;
$$;
