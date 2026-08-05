-- Endurece grants: ninguém com anon/authenticated libera plano ou mexe em security_*.
-- CREATE OR REPLACE em migrations anteriores pode ter reintroduzido EXECUTE para anon.

-- Assinatura / pagamento (somente service_role)
REVOKE ALL ON FUNCTION public.activate_subscription(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_subscription(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_subscription(text) TO service_role;

REVOKE ALL ON FUNCTION public.activate_or_extend_subscription(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_or_extend_subscription(uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_or_extend_subscription(uuid, text, text, text) TO service_role;

-- Funções de segurança (somente service_role), exceto clear_my (usuário autenticado)
REVOKE ALL ON FUNCTION public.security_get_login_state(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_get_login_state(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_get_login_state(text) TO service_role;

REVOKE ALL ON FUNCTION public.security_record_login_failure(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_record_login_failure(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_record_login_failure(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.security_record_login_success(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_record_login_success(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_record_login_success(text) TO service_role;

REVOKE ALL ON FUNCTION public.security_clear_login_lockout(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_clear_login_lockout(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_clear_login_lockout(text) TO service_role;

REVOKE ALL ON FUNCTION public.security_check_registration_rate_limit(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_check_registration_rate_limit(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_check_registration_rate_limit(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.security_record_registration_attempt(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_record_registration_attempt(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_record_registration_attempt(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.security_get_pending_alerts(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_get_pending_alerts(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_get_pending_alerts(integer) TO service_role;

REVOKE ALL ON FUNCTION public.security_mark_alert_processed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_mark_alert_processed(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_mark_alert_processed(uuid) TO service_role;

-- Usuário logado pode limpar o próprio lockout (já era o desenho)
REVOKE ALL ON FUNCTION public.security_clear_my_login_lockout() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.security_clear_my_login_lockout() FROM anon;
GRANT EXECUTE ON FUNCTION public.security_clear_my_login_lockout() TO authenticated;
