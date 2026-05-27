-- Revoke the default PUBLIC execute grant and grant only to authenticated
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_workspace_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.shares_workspace_with(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_workspace_with(uuid) TO authenticated;
