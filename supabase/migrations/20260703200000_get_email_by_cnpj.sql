-- Permite buscar e-mail pelo CNPJ antes da autenticação (login e recuperação de senha)
CREATE OR REPLACE FUNCTION public.get_email_by_cnpj(p_cnpj text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT email INTO v_email
  FROM public.postos
  WHERE regexp_replace(cnpj, '\D', '', 'g') = regexp_replace(p_cnpj, '\D', '', 'g')
  LIMIT 1;

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.get_email_by_cnpj(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_email_by_cnpj(text) TO anon, authenticated;
