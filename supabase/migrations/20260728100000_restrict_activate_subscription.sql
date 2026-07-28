-- Restringe activate_subscription apenas ao service_role.
-- REVOKE FROM PUBLIC não remove grants explícitos a anon/authenticated.

REVOKE EXECUTE ON FUNCTION public.activate_subscription(text) FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.activate_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_subscription(text) TO service_role;
