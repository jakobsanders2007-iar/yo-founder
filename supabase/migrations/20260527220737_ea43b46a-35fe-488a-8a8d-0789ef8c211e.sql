-- Update is_workspace_owner to also use auth.uid() internally for consistency
CREATE OR REPLACE FUNCTION public.is_workspace_owner(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id
    AND user_id = auth.uid()
    AND role = 'owner'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_workspace_owner(uuid) TO authenticated;

-- Recreate shares_workspace_with as single-arg auth.uid() version for consistency
CREATE OR REPLACE FUNCTION public.shares_workspace_with(_other_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members a
    JOIN public.workspace_members b ON a.workspace_id = b.workspace_id
    WHERE a.user_id = auth.uid()
    AND b.user_id = _other_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.shares_workspace_with(uuid) TO authenticated;

-- Drop and recreate messages policies with new signature
DROP POLICY IF EXISTS messages_insert_member_human ON public.messages;
CREATE POLICY "messages_insert_member_human"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  is_workspace_member(workspace_id)
  AND sender_user_id = auth.uid()
  AND sender_type = 'human'
);

DROP POLICY IF EXISTS messages_select_members ON public.messages;
CREATE POLICY "messages_select_members"
ON public.messages
FOR SELECT
TO authenticated
USING (is_workspace_member(workspace_id));

-- Drop and recreate prompts policies
DROP POLICY IF EXISTS prompts_delete_members ON public.prompts;
CREATE POLICY "prompts_delete_members"
ON public.prompts
FOR DELETE
TO authenticated
USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS prompts_insert_members ON public.prompts;
CREATE POLICY "prompts_insert_members"
ON public.prompts
FOR INSERT
TO authenticated
WITH CHECK (
  is_workspace_member(workspace_id)
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS prompts_select_members ON public.prompts;
CREATE POLICY "prompts_select_members"
ON public.prompts
FOR SELECT
TO authenticated
USING (is_workspace_member(workspace_id));

DROP POLICY IF EXISTS prompts_update_members ON public.prompts;
CREATE POLICY "prompts_update_members"
ON public.prompts
FOR UPDATE
TO authenticated
USING (is_workspace_member(workspace_id));

-- Update workspace_members policies
DROP POLICY IF EXISTS wm_delete_self_or_owner ON public.workspace_members;
CREATE POLICY "wm_delete_self_or_owner"
ON public.workspace_members
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR is_workspace_owner(workspace_id)
);

DROP POLICY IF EXISTS wm_select_members ON public.workspace_members;
CREATE POLICY "wm_select_members"
ON public.workspace_members
FOR SELECT
TO authenticated
USING (is_workspace_member(workspace_id));

-- Update workspace_invites policies
DROP POLICY IF EXISTS invites_insert_members ON public.workspace_invites;
CREATE POLICY "invites_insert_members"
ON public.workspace_invites
FOR INSERT
TO authenticated
WITH CHECK (
  is_workspace_member(workspace_id)
  AND invited_by = auth.uid()
);

DROP POLICY IF EXISTS invites_update_members ON public.workspace_invites;
CREATE POLICY "invites_update_members"
ON public.workspace_invites
FOR UPDATE
TO authenticated
USING (
  is_workspace_member(workspace_id)
  OR true -- accept invite token flow
);

-- Update workspaces policies
DROP POLICY IF EXISTS workspaces_delete_owner ON public.workspaces;
CREATE POLICY "workspaces_delete_owner"
ON public.workspaces
FOR DELETE
TO authenticated
USING (is_workspace_owner(id));

DROP POLICY IF EXISTS workspaces_select_members ON public.workspaces;
CREATE POLICY "workspaces_select_members"
ON public.workspaces
FOR SELECT
TO authenticated
USING (is_workspace_member(id));

DROP POLICY IF EXISTS workspaces_update_members ON public.workspaces;
CREATE POLICY "workspaces_update_members"
ON public.workspaces
FOR UPDATE
TO authenticated
USING (is_workspace_member(id));

DROP POLICY IF EXISTS workspaces_update_owner ON public.workspaces;
CREATE POLICY "workspaces_update_owner"
ON public.workspaces
FOR UPDATE
TO authenticated
USING (is_workspace_owner(id));

-- Update profiles shared policy
DROP POLICY IF EXISTS profiles_select_shared ON public.profiles;
CREATE POLICY "profiles_select_shared"
ON public.profiles
FOR SELECT
TO authenticated
USING (shares_workspace_with(id));
