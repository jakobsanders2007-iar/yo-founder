-- Revoke anon access to security definer helper functions
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_workspace_owner(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.shares_workspace_with(uuid) FROM anon;
