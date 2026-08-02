-- Mercado Pago billing fields + payment ledger + activate/extend helper

ALTER TABLE public.postos
  ADD COLUMN IF NOT EXISTS billing_mode text
    CHECK (billing_mode IS NULL OR billing_mode IN ('one_time', 'recurring')),
  ADD COLUMN IF NOT EXISTS mp_customer_id text,
  ADD COLUMN IF NOT EXISTS mp_preapproval_id text,
  ADD COLUMN IF NOT EXISTS mp_last_payment_id text,
  ADD COLUMN IF NOT EXISTS subscription_reminded_at timestamptz;

CREATE TABLE IF NOT EXISTS public.mp_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posto_id uuid REFERENCES public.postos (id) ON DELETE SET NULL,
  cnpj text NOT NULL,
  mp_payment_id text NOT NULL,
  method text NOT NULL
    CHECK (method IN ('pix', 'boleto', 'card_once', 'card_recurring')),
  status text NOT NULL,
  external_reference text,
  amount_cents integer NOT NULL DEFAULT 9900,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mp_payments_mp_payment_id_key UNIQUE (mp_payment_id)
);

CREATE INDEX IF NOT EXISTS mp_payments_posto_id_idx ON public.mp_payments (posto_id);
CREATE INDEX IF NOT EXISTS mp_payments_cnpj_idx ON public.mp_payments (cnpj);
CREATE INDEX IF NOT EXISTS mp_payments_status_idx ON public.mp_payments (status);

ALTER TABLE public.mp_payments ENABLE ROW LEVEL SECURITY;

-- Sem policies para authenticated/anon: acesso só via service_role nas Edge Functions.

CREATE OR REPLACE FUNCTION public.activate_or_extend_subscription(
  p_posto_id uuid,
  p_billing_mode text DEFAULT NULL,
  p_mp_payment_id text DEFAULT NULL,
  p_mp_preapproval_id text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posto public.postos%ROWTYPE;
  v_new_ends timestamptz;
BEGIN
  SELECT * INTO v_posto
  FROM public.postos
  WHERE id = p_posto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'message', 'Posto não encontrado.');
  END IF;

  IF v_posto.subscription_status = 'active'
     AND v_posto.subscription_ends_at IS NOT NULL
     AND v_posto.subscription_ends_at > now() THEN
    v_new_ends := v_posto.subscription_ends_at + interval '30 days';
  ELSE
    v_new_ends := now() + interval '30 days';
  END IF;

  UPDATE public.postos
  SET
    subscription_status = 'active',
    subscription_ends_at = v_new_ends,
    billing_mode = COALESCE(p_billing_mode, billing_mode),
    mp_last_payment_id = COALESCE(p_mp_payment_id, mp_last_payment_id),
    mp_preapproval_id = COALESCE(p_mp_preapproval_id, mp_preapproval_id),
    updated_at = now()
  WHERE id = p_posto_id
  RETURNING * INTO v_posto;

  RETURN json_build_object(
    'ok', true,
    'posto_id', v_posto.id,
    'subscription_status', v_posto.subscription_status,
    'subscription_ends_at', v_posto.subscription_ends_at,
    'billing_mode', v_posto.billing_mode
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_posto public.postos%ROWTYPE;
  v_status text;
  v_days_left numeric;
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
    v_posto.subscription_status := 'expired';
  END IF;

  IF v_status = 'active' AND v_posto.subscription_ends_at IS NOT NULL THEN
    v_days_left := EXTRACT(EPOCH FROM (v_posto.subscription_ends_at - now())) / 86400.0;
  ELSE
    v_days_left := NULL;
  END IF;

  RETURN json_build_object(
    'found', true,
    'subscription_status', v_status,
    'subscription_ends_at', v_posto.subscription_ends_at,
    'billing_mode', v_posto.billing_mode,
    'days_left', v_days_left,
    'is_read_only', v_status = 'expired'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_or_extend_subscription(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_or_extend_subscription(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_my_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;
