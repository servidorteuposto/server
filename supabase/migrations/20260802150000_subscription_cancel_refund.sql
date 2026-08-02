-- Cancelamento de plano recorrente + elegibilidade de reembolso (7 dias)

ALTER TABLE public.postos
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_requested_at timestamptz;

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
    cancel_at_period_end = false,
    subscription_cancelled_at = NULL,
    refund_requested_at = NULL,
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
  v_last_approved timestamptz;
  v_can_refund boolean;
  v_can_cancel boolean;
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

  SELECT MAX(updated_at) INTO v_last_approved
  FROM public.mp_payments
  WHERE posto_id = v_posto.id
    AND status = 'approved'
    AND mp_payment_id NOT LIKE 'preapproval_%';

  v_can_refund :=
    v_status = 'active'
    AND v_posto.refund_requested_at IS NULL
    AND v_last_approved IS NOT NULL
    AND v_last_approved >= (now() - interval '7 days');

  v_can_cancel :=
    v_status = 'active'
    AND v_posto.cancel_at_period_end = false
    AND (
      v_posto.billing_mode = 'recurring'
      OR v_posto.mp_preapproval_id IS NOT NULL
    );

  RETURN json_build_object(
    'found', true,
    'subscription_status', v_status,
    'subscription_ends_at', v_posto.subscription_ends_at,
    'billing_mode', v_posto.billing_mode,
    'days_left', v_days_left,
    'is_read_only', v_status = 'expired',
    'cancel_at_period_end', v_posto.cancel_at_period_end,
    'subscription_cancelled_at', v_posto.subscription_cancelled_at,
    'refund_requested_at', v_posto.refund_requested_at,
    'can_cancel_recurring', v_can_cancel,
    'can_request_refund', v_can_refund,
    'last_approved_payment_at', v_last_approved
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_or_extend_subscription(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_or_extend_subscription(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_my_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;
