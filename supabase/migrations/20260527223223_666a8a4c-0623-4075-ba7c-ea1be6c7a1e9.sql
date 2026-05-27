
-- Ensure helper function is SECURITY DEFINER and executable
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;

-- Make sure table grants are in place
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;

-- Drop and recreate the three policies the user requested
DROP POLICY IF EXISTS workspaces_insert_self ON public.workspaces;
DROP POLICY IF EXISTS workspaces_select_members ON public.workspaces;
DROP POLICY IF EXISTS workspaces_update_members ON public.workspaces;
DROP POLICY IF EXISTS workspaces_update_owner ON public.workspaces;
DROP POLICY IF EXISTS "Authenticated users can insert workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Users can select their workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Workspace owners can update their workspaces" ON public.workspaces;

CREATE POLICY "Authenticated users can insert workspaces"
ON public.workspaces
FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can select their workspaces"
ON public.workspaces
FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.is_workspace_member(id));

CREATE POLICY "Workspace owners can update their workspaces"
ON public.workspaces
FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.is_workspace_owner(id))
WITH CHECK (created_by = auth.uid() OR public.is_workspace_owner(id));
