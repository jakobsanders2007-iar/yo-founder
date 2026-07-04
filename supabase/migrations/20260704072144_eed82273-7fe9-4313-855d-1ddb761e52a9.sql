
-- Lock down SECURITY DEFINER functions: revoke from PUBLIC/anon; grant only where needed.
REVOKE ALL ON FUNCTION public.shares_workspace_with(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_last_seen() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.shares_workspace_with(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;
